import { createClient } from "@/lib/supabase/client";
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
