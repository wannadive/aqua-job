// 로그인 유지 설정: 순수 로직(저장소 접근 없음). 저장소 연결은 lib/supabase/client.ts.
export const KEEP_LOGIN_KEY = "aqua.keepLogin";

/** 저장된 값 → 로그인 유지 여부. 값이 없거나 알 수 없으면 켜짐(기본). */
export function parseKeepLogin(raw: string | null | undefined): boolean {
  return raw !== "0";
}

export function serializeKeepLogin(keep: boolean): "1" | "0" {
  return keep ? "1" : "0";
}

/** Supabase 인증 세션이 담기는 키인지 (sb-<ref>-auth-token 및 -code-verifier 등). */
export function isAuthStorageKey(key: string): boolean {
  return /^sb-.+-auth-token/.test(key);
}
