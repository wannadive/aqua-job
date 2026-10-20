import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

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
