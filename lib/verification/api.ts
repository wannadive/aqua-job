import { createClient } from "@/lib/supabase/client";
import { docFromRow } from "./mappers";
import type { DocRecord } from "./types";

/** 내가 낸 서류 전부(최신순). 오류는 던진다. */
export async function fetchMyDocuments(): Promise<DocRecord[]> {
  const { data: s } = await createClient().auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return [];
  const { data, error } = await createClient()
    .from("documents")
    .select("id, owner_id, doc_type, status, valid_until, meta, reject_reason, submitted_at, verified_at")
    .eq("owner_id", uid)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(docFromRow);
}
