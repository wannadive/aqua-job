"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/app-shell/auth-provider";

export function BlockedScreen() {
  const { logout } = useAuth();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-card bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-ink">이용이 제한된 계정이에요</h1>
        <p className="mt-2 text-sm text-muted">문의가 필요하면 운영팀에 연락해 주세요.</p>
        <Button className="mt-6 w-full" onClick={() => void logout()}>
          로그아웃
        </Button>
      </div>
    </main>
  );
}
