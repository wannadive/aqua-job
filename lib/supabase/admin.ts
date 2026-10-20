import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// service role 클라이언트: RLS를 건너뛰므로 서버(API 라우트)에서만 쓴다.
// "server-only"가 클라이언트 번들에 들어오면 빌드가 실패한다. 아래 검사는 그 위의 이중 안전장치.
export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("admin client is server-only");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("service role is not configured");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
