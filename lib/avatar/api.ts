import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";

/** 사진을 줄여서 avatars 버킷에 올리고 저장 경로({uid}/{uuid}.jpg)를 돌려준다. */
export async function uploadAvatar(file: File): Promise<{ path?: string; error?: string }> {
  try {
    const { data } = await createClient().auth.getSession();
    const uid = data.session?.user.id;
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
