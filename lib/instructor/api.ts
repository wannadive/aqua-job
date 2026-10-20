import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import type { InstructorProfile, PrivateContacts } from "./types";
import { fromRow, toRow } from "./mappers";
export { fromRow, toRow, recordsFromDb, recordsToDb } from "./mappers";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function myId(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchMyInstructorProfile(): Promise<InstructorProfile | null> {
  const uid = await myId();
  if (!uid) return null;
  const { data, error } = await createClient().from("instructor_profiles").select("*").eq("user_id", uid).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data) : null;
}

export async function saveInstructorProfile(patch: Partial<InstructorProfile>): Promise<{ error?: string }> {
  try {
    const uid = await myId();
    if (!uid) return { error: "로그인이 필요해요" };
    const { error } = await (createClient().from("instructor_profiles") as any).upsert(
      { user_id: uid, ...toRow(patch) },
      { onConflict: "user_id" },
    );
    if (error) return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요" };
    return {};
  } catch {
    return { error: "네트워크 연결을 확인해 주세요" };
  }
}

/** 사진을 줄여서 avatars 버킷에 올리고 저장 경로({uid}/{uuid}.jpg)를 돌려준다. */
export async function uploadAvatar(file: File): Promise<{ path?: string; error?: string }> {
  try {
    const uid = await myId();
    if (!uid) return { error: "로그인이 필요해요" };
    const small = await compressImage(file, 800);
    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    const { error } = await createClient().storage.from("avatars").upload(path, small, { contentType: "image/jpeg" });
    if (error) return { error: "사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요" };
    return { path };
  } catch {
    return { error: "사진을 처리하지 못했어요" };
  }
}

export function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  return createClient().storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

export async function fetchMyContacts(): Promise<PrivateContacts> {
  const uid = await myId();
  if (!uid) return { phone: "", email: "" };
  const { data, error } = await createClient().from("private_contacts").select("phone, email").eq("user_id", uid).maybeSingle();
  if (error) throw new Error(error.message);
  return { phone: data?.phone ?? "", email: data?.email ?? "" };
}

export async function saveMyContacts(c: PrivateContacts): Promise<{ error?: string }> {
  try {
    const uid = await myId();
    if (!uid) return { error: "로그인이 필요해요" };
    const { error } = await (createClient().from("private_contacts") as any)
      .update({ phone: c.phone.trim() || null, email: c.email.trim() || null })
      .eq("user_id", uid);
    if (error) return { error: "연락처를 저장하지 못했어요" };
    return {};
  } catch {
    return { error: "네트워크 연결을 확인해 주세요" };
  }
}

/** 서류 상태 요약용: 서류 종류별 최신 제출 건의 상태 건수 */
export async function fetchMyDocSummary(): Promise<{ submitted: number; verified: number; rejected: number }> {
  const out = { submitted: 0, verified: 0, rejected: 0 };
  const uid = await myId();
  if (!uid) return out;
  const { data } = await createClient()
    .from("documents")
    .select("doc_type, status, submitted_at")
    .eq("owner_id", uid)
    .order("submitted_at", { ascending: false });
  const seen = new Set<string>();
  for (const d of (data ?? []) as any[]) {
    if (seen.has(d.doc_type)) continue;
    seen.add(d.doc_type);
    if (d.status in out) out[d.status as keyof typeof out]++;
  }
  return out;
}
