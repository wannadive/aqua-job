const KEY = "aqua.deviceKey";

function generate(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replaceAll("-", "");
    }
  } catch {}
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

let memoryKey: string | null = null;

/** 비로그인 조회수용 기기 키(localStorage). 저장이 막혀 있으면 이번 방문용 임시 키. SSR에서는 빈 문자열. */
export function getDeviceKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const cur = window.localStorage.getItem(KEY);
    if (cur && /^[A-Za-z0-9_-]{16,64}$/.test(cur)) return cur;
    const next = generate();
    window.localStorage.setItem(KEY, next);
    return next;
  } catch {
    memoryKey ??= generate();
    return memoryKey;
  }
}
