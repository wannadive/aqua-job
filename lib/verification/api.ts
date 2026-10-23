import { createClient } from "@/lib/supabase/client";
import { VERIFICATION_BUCKET } from "./config";
import { docFromRow } from "./mappers";
import type { DocRecord, DocType } from "./types";

/** 내가 낸 서류 전부(최신순). 오류는 던진다. */
export async function fetchMyDocuments(): Promise<DocRecord[]> {
  const { data: s } = await createClient().auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return [];
  const { data, error } = await createClient()
    .from("verification_documents")
    .select("id, owner_id, doc_type, status, valid_until, meta, reject_reason, submitted_at, verified_at")
    .eq("owner_id", uid)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(docFromRow);
}

const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** 서류 사진(호출자가 이미 압축한 File)을 비공개 버킷(verification-docs)에 올리고 verification_documents에 '확인 대기'로 제출한다. insert가 실패하면 올린 파일을 지운다. */
export async function submitDocument(input: {
  docType: DocType;
  file: File;
  meta?: DocRecord["meta"];
}): Promise<{ error?: string }> {
  const sb = createClient();
  let path: string | null = null;
  try {
    const { data: s } = await sb.auth.getSession();
    const uid = s.session?.user.id;
    if (!uid) return { error: "로그인이 필요해요" };
    const ext = EXT_BY_TYPE[input.file.type] ?? "jpg";
    path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from(VERIFICATION_BUCKET).upload(path, input.file, { contentType: input.file.type || "image/jpeg" });
    if (up.error) return { error: "사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요" };
    const meta = Object.fromEntries(Object.entries(input.meta ?? {}).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
    const { error } = await (sb as any)
      .from("verification_documents")
      .insert({ owner_id: uid, doc_type: input.docType, status: "submitted", bucket: VERIFICATION_BUCKET, file_path: path, meta });
    if (error) {
      await sb.storage.from(VERIFICATION_BUCKET).remove([path]);
      return { error: "서류를 제출하지 못했어요. 잠시 후 다시 시도해 주세요" };
    }
    return {};
  } catch {
    if (path) await sb.storage.from(VERIFICATION_BUCKET).remove([path]).catch(() => {});
    return { error: "사진을 처리하지 못했어요" };
  }
}
