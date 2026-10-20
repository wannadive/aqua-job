import { createClient } from "@/lib/supabase/client";
import { isMissingObjectError, isSuperseded, latestPendingPerOwnerType, PURGE_DOC_TYPES } from "./admin-logic";
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
    sb.from("profiles").select("id, display_name").in("id", ownerIds),
  ]);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (ownersRes.error) throw new Error(ownersRes.error.message);

  const owners = new Map(
    (ownersRes.data ?? []).map((p: { id: string; display_name: string }) => [p.id, p] as const),
  );
  return latestPendingPerOwnerType((docsRes.data ?? []).map(docFromRow)).map((d) => {
    const o = owners.get(d.ownerId);
    return {
      ...d,
      ownerName: o?.display_name ?? "(이름 없음)",
      // 여러 역할 계정도 있으니 가입 역할이 아니라 서류 종류로 강사용·센터용을 나눈다
      ownerRole: DOC_TYPES[d.docType].owner,
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

/** 신분증 원본을 서버에서 지운다(확인·반려됐거나 새로 올려 밀려난 건). 실패하면 error를 준다. */
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
    if (res.status === 503) return { error: "서버가 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요" };
    if (!res.ok) return { error: "원본 사진을 지우지 못했어요" };
    return {};
  } catch {
    return { error: "원본 사진을 지우지 못했어요" };
  }
}

/**
 * 확인/반려. 원본 삭제 대상(신분증)이면 확인이든 반려든 처리 직후 원본도 지운다.
 * purgeFailed: 확인·반려는 끝났지만 원본 삭제만 실패한 경우(다시 시도는 purgeOriginal).
 */
export async function reviewDocument(input: {
  docId: string;
  decision: "verified" | "rejected";
  /** 화면이 이미 알고 있는 서류 종류. 신분증이면 확인·반려 뒤 원본을 지운다. */
  docType: DocRecord["docType"];
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

  if (!DOC_TYPES[input.docType].deleteOriginalOnVerify) return {};
  const purge = await purgeOriginal(input.docId);
  if (!purge.error) return {};
  const done = input.decision === "verified" ? "확인은" : "반려는";
  return { error: `${done} 됐지만 원본 사진을 지우지 못했어요`, purgeFailed: true };
}

export type PendingPurge = {
  id: string;
  docType: DocRecord["docType"];
  ownerName: string;
  /** 왜 지워야 하는지: 확인됨·반려됨·새로 올려 밀려남 */
  reason: "verified" | "rejected" | "superseded";
  /** 확인 시각, 밀려난 건은 제출 시각(반려 시각은 따로 저장하지 않아 null) */
  at: string | null;
};

type PurgeRow = {
  id: string;
  owner_id: string;
  doc_type: DocRecord["docType"];
  status: "submitted" | "verified" | "rejected";
  submitted_at: string;
  verified_at: string | null;
};

/**
 * 원본(신분증) 사진이 아직 남아 있어 지워야 하는 서류. 오류는 던진다.
 * - 확인됨·반려됨인데 원본이 남은 건
 * - 확인 대기지만 같은 사람이 같은 종류를 더 최근에 다시 올려 밀려난 건
 * 최종 판단은 삭제 API가 서버에서 다시 한다.
 */
export async function fetchPendingPurges(): Promise<PendingPurge[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("documents")
    .select("id, owner_id, doc_type, status, submitted_at, verified_at")
    .in("doc_type", PURGE_DOC_TYPES)
    .not("file_path", "is", null)
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PurgeRow[];
  if (rows.length === 0) return [];

  // 확인 대기 건이 밀려났는지 보려면 같은 사람의 신분증 제출 전부(원본이 지워진 건 포함)가 필요하다.
  const pendingOwners = [...new Set(rows.filter((r) => r.status === "submitted").map((r) => r.owner_id))];
  let siblings: { id: string; ownerId: string; docType: string; submittedAt: string }[] = [];
  if (pendingOwners.length > 0) {
    const sib = await sb
      .from("documents")
      .select("id, owner_id, doc_type, submitted_at")
      .in("owner_id", pendingOwners)
      .in("doc_type", PURGE_DOC_TYPES);
    if (sib.error) throw new Error(sib.error.message);
    siblings = ((sib.data ?? []) as { id: string; owner_id: string; doc_type: string; submitted_at: string }[]).map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      docType: r.doc_type,
      submittedAt: r.submitted_at,
    }));
  }

  const targets = rows.filter(
    (r) =>
      r.status !== "submitted" ||
      isSuperseded({ id: r.id, ownerId: r.owner_id, docType: r.doc_type, submittedAt: r.submitted_at }, siblings),
  );
  if (targets.length === 0) return [];

  const owners = await sb.from("profiles").select("id, display_name").in("id", [...new Set(targets.map((r) => r.owner_id))]);
  if (owners.error) throw new Error(owners.error.message);
  const names = new Map((owners.data ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name] as const));
  return targets.map((r) => ({
    id: r.id,
    docType: r.doc_type,
    ownerName: names.get(r.owner_id) ?? "(이름 없음)",
    reason: r.status === "submitted" ? "superseded" : r.status,
    at: r.status === "verified" ? r.verified_at : r.status === "submitted" ? r.submitted_at : null,
  }));
}
