import { createClient } from "@/lib/supabase/client";
import { centerFromRow, centerToRow } from "./mappers";
import type { CenterProfile } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function myId(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchMyCenterProfile(): Promise<CenterProfile | null> {
  const uid = await myId();
  if (!uid) return null;
  const { data, error } = await createClient().from("center_profiles").select("*").eq("user_id", uid).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? centerFromRow(data) : null;
}

export async function saveCenterProfile(patch: Partial<CenterProfile>): Promise<{ error?: string }> {
  try {
    const uid = await myId();
    if (!uid) return { error: "로그인이 필요해요" };
    const { error } = await (createClient().from("center_profiles") as any).upsert(
      { user_id: uid, ...centerToRow(patch) },
      { onConflict: "user_id" },
    );
    if (error) return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요" };
    return {};
  } catch {
    return { error: "네트워크 연결을 확인해 주세요" };
  }
}
