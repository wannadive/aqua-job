import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { KEEP_LOGIN_KEY, isAuthStorageKey, parseKeepLogin, serializeKeepLogin } from "./keep-login";

// 로그인 유지 설정에 따라 인증 세션을 localStorage(유지) 또는 sessionStorage(이 탭/세션만)에 둔다.
// 설정은 localStorage의 aqua.keepLogin("1"/"0"). 모든 접근은 try/catch (사생활 보호 모드 등에서 throw 가능).
// 참고: iOS 홈 화면 앱(standalone PWA)은 앱을 완전히 종료하면 sessionStorage를 지울 수 있다.
// "로그인 유지"를 끈 경우 그게 의도한 동작이다(앱을 닫으면 로그아웃).
function getStore(kind: "local" | "session"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getKeepLogin(): boolean {
  try {
    return parseKeepLogin(getStore("local")?.getItem(KEEP_LOGIN_KEY));
  } catch {
    return true;
  }
}

/** 로그인 직전에 호출. 끄면 localStorage에 남은 예전 인증 세션도 지운다. */
export function setKeepLogin(keep: boolean) {
  const local = getStore("local");
  try {
    local?.setItem(KEEP_LOGIN_KEY, serializeKeepLogin(keep));
  } catch {}
  if (!keep && local) {
    try {
      for (const k of Object.keys(local)) if (isAuthStorageKey(k)) local.removeItem(k);
    } catch {}
  }
}

const authStorage = {
  getItem(key: string): string | null {
    const local = getStore("local");
    const session = getStore("session");
    const [first, second] = getKeepLogin() ? [local, session] : [session, local];
    try {
      const v = first?.getItem(key);
      if (v != null) return v;
    } catch {}
    try {
      return second?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    const keep = getKeepLogin();
    const target = getStore(keep ? "local" : "session");
    const other = getStore(keep ? "session" : "local");
    try {
      target?.setItem(key, value);
    } catch {}
    try {
      other?.removeItem(key); // 두 저장소에 세션이 중복되지 않게
    } catch {}
  },
  removeItem(key: string) {
    for (const kind of ["local", "session"] as const) {
      try {
        getStore(kind)?.removeItem(key);
      } catch {}
    }
  },
};

// 모바일에서 탭이 백그라운드로 내려갔다 돌아왔을 때 진행 중이던 fetch가 resolve도
// reject도 되지 않고 그대로 멈춰버리는 경우가 있음(iOS WebKit). 이 fetch가 물고 있으면
// 그 위에 쌓인 세션 복원/데이터 로딩이 전부 무한 로딩에 빠진다. 그래서 모든 요청에
// 타임아웃을 걸어 "응답이 없으면 실패 처리"가 되도록 강제한다(안 그러면 실패조차 안 함).
// 15초는 셀룰러 재연결(DNS+TLS+요청 왕복)이 오래 걸리는 상황까지 감안한 여유값.
export const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (init.signal) return fetch(input, init); // 호출자가 이미 signal을 지정했으면 그대로 둔다
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Singleton: React Strict Mode + HMR에서도 GoTrueClient 1개만 유지
const g = globalThis as unknown as {
  _supabase: ReturnType<typeof createSupabaseClient<Database>> | undefined;
};

if (!g._supabase) {
  g._supabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: authStorage,
        // navigator.locks가 React Strict Mode에서 충돌하므로 직접 실행으로 우회
        lock: async (name, acquireTimeout, fn) => {
          return await fn();
        },
      },
      global: { fetch: fetchWithTimeout },
    }
  );
}

export function createClient() {
  return g._supabase!;
}
