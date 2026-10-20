"use client";

import { AppRouter } from "@/components/app-router";
import { SupabaseAuthProvider } from "@/lib/supabase/auth-provider";

// 관리자 로그인은 이 주소로만 들어온다. 관리자가 아니면 routeFor가 본인 홈으로 보낸다.
export default function AdminPage() {
  return (
    <SupabaseAuthProvider>
      <AppRouter adminEntry />
    </SupabaseAuthProvider>
  );
}
