"use client";

import { AppRouter } from "@/components/app-router";
import { SupabaseAuthProvider } from "@/lib/supabase/auth-provider";

export default function Page() {
  return (
    <SupabaseAuthProvider>
      <AppRouter />
    </SupabaseAuthProvider>
  );
}
