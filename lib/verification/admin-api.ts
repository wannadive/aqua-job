import { createClient } from "@/lib/supabase/client";
import { isMissingObjectError, latestPendingPerOwnerType } from "./admin-logic";
import { DOC_TYPES } from "./config";
import { docFromRow } from "./mappers";
import type { DocRecord } from "./types";

// 관리자 화면 전용. RLS가 관리자에게만 모든 서류·Storage 객체 조회를 허용한다.

export type ReviewItem = DocRecord & { ownerName: string; ownerRole: "instructor" | "center" };

const DOC_COLUMNS = "id, owner_id, doc_type, status, valid_until, meta, reject_reason, submitted_at, verified_at";

/** 확인 대기 서류(오래된 순). 같은 사람·같은 종류는 가장 최근 제출 건만. 오류는 던진다. */
export async function fetchReviewQueue(): Promise<ReviewItem[]> {
  const sb = createClient();
  const pending = await sb.from("documents").select("owner_id").eq("status", "submitted");
  if (pending.error) throw new Error(pending.error.message);
  const ownerIds = [...new Set((pending.data ?? []).map((r: { owner_id: string }) => r.owner_id))];
  if (ownerIds.length === 0) return [];

  // 같은 사람의 처리된 건까지 받아야 "더 최근 건이 이미 처리돼 밀려난 대기 건"을 가려낼 수 있다.
  const [docsRes, ownersRes] = await Promise.all([
    sb.from("documents").select(DOC_COLUMNS).in("owner_id", ownerIds),
    sb.from("profiles").select("id, display_name, role").in("id", ownerIds),
  ]);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (ownersRes.error) throw new Error(ownersRes.error.message);

  const owners = new Map(
    (ownersRes.data ?? []).map((p: { id: string; display_name: string; role: string }) => [p.id, p] as const),
  );
  return latestPendingPerOwnerType((docsRes.data ?? []).map(docFromRow)).map((d) => {
    const o = owners.get(d.ownerId);
    return {
      ...d,
      ownerName: o?.display_name ?? "(이름 없음)",
      ownerRole: o?.role === "center" ? "center" : "instructor",
    };
  });
}

export type ReviewDetail =
  | { state: "gone" }
  | { state: "processed"; doc: DocRecord }
  | { state: "superseded"; doc: DocRecord }
  | { state: "ready"; doc: DocRecord; imageUrl: string | null; fileMissing: boolean };

/** 서류 한 건을 다시 읽고(처리됨·바뀜 확인), 사진은 60초짜리 서명 주소로 준다. 일시 오류는 던진다. */
export async function fetchReviewDetail(docId: string): Promise<ReviewDetail> {
  const sb = createClient();
  const { data: row, error } = await sb
    .from("documents")
    .select(`${DOC_COLUMNS}, file_path`)
    .eq("id", docId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { state: "gone" };
  const doc = docFromRow(row);
  if (doc.status !== "submitted") return { state: "processed", doc };

  const sameType = await sb
    .from("documents")
    .select("id, owner_id, doc_type, status, submitted_at")
    .eq("owner_id", doc.ownerId)
    .eq("doc_type", doc.docType);
  if (sameType.error) throw new Error(sameType.error.message);
  const latest = latestPendingPerOwnerType(
    (sameType.data ?? []).map((r: any) => ({ id: r.id, ownerId: r.owner_id, docType: r.doc_type, status: r.status, submittedAt: r.submitted_at })),
  );
  if (latest[0]?.id !== doc.id) return { state: "superseded", doc };

  const path = (row as { file_path: string | null }).file_path;
  if (!path) return { state: "ready", doc, imageUrl: null, fileMissing: true };
  const signed = await sb.storage.from("documents").createSignedUrl(path, 60);
  if (signed.error) {
    if (isMissingObjectError(signed.error as { message?: string; statusCode?: string | number })) {
      return { state: "ready", doc, imageUrl: null, fileMissing: true };
    }
    throw new Error(signed.error.message);
  }
  return { state: "ready", doc, imageUrl: signed.data.signedUrl, fileMissing: false };
}

const RPC_ERRORS: { match: RegExp; message: string }[] = [
  { match: /이미 처리된/, message: "이미 처리된 서류예요" },
  { match: /유효기간/, message: "유효기간을 입력해 주세요" },
  { match: /반려 사유/, message: "반려 사유를 입력해 주세요" },
  { match: /관리자만/, message: "관리자만 처리할 수 있어요" },
  { match: /찾을 수 없/, message: "서류를 찾을 수 없어요" },
];

/** 확인된 신분증 원본을 서버에서 지운다. 실패하면 error를 준다. */
export async function purgeOriginal(docId: string): Promise<{ error?: string }> {
  try {
    const { data: s } = await createClient().auth.getSession();
    const token = s.session?.access_token;
    if (!token) return { error: "로그인이 필요해요" };
    const res = await fetch("/api/admin/purge-original", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ docId }),
    });
    if (!res.ok) return { error: "원본 사진을 지우지 못했어요" };
    return {};
  } catch {
    return { error: "원본 사진을 지우지 못했어요" };
  }
}

/**
 * 확인/반려. 확인이면서 원본 삭제 대상(신분증)이면 원본도 지운다.
 * purgeFailed: 확인은 끝났지만 원본 삭제만 실패한 경우(다시 시도는 purgeOriginal).
 */
export async function reviewDocument(input: {
  docId: string;
  decision: "verified" | "rejected";
  validUntil?: string;
  reason?: string;
}): Promise<{ error?: string; purgeFailed?: boolean }> {
  try {
    const { error } = await (createClient() as any).rpc("review_document", {
      p_doc_id: input.docId,
      p_decision: input.decision,
      p_valid_until: input.validUntil || null,
      p_reason: input.reason?.trim() || null,
    });
    if (error) {
      const known = RPC_ERRORS.find((e) => e.match.test(error.message ?? ""));
      return { error: known?.message ?? "처리하지 못했어요. 잠시 후 다시 시도해 주세요" };
    }
  } catch {
    return { error: "네트워크 연결을 확인해 주세요" };
  }

  if (input.decision !== "verified") return {};
  const failed = { error: "확인은 됐지만 원본 사진을 지우지 못했어요", purgeFailed: true };
  try {
    const { data, error } = await createClient().from("documents").select("doc_type").eq("id", input.docId).maybeSingle();
    if (error || !data) return failed;
    const docType = (data as { doc_type: DocRecord["docType"] }).doc_type;
    if (!DOC_TYPES[docType]?.deleteOriginalOnVerify) return {};
  } catch {
    return failed;
  }
  const purge = await purgeOriginal(input.docId);
  return purge.error ? failed : {};
}
