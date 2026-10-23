"use client";

import { AppRouter } from "@/components/app-shell/app-router";
import { SupabaseAuthProvider } from "@/lib/app-shell/auth-provider";

export default function Page() {
  return (
    <SupabaseAuthProvider>
      <AppRouter />
    </SupabaseAuthProvider>
  );
}
