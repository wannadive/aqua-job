"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { useAuth } from "@/lib/supabase/auth-provider";

export function LoginForm({ onSignup, isAdminEntry }: { onSignup?: () => void; isAdminEntry?: boolean }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepLogin, setKeepLogin] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("이메일과 비밀번호를 입력해 주세요");
      return;
    }
    setBusy(true);
    const res = await login(email, password, keepLogin);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-card bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{BRAND.appName}</h1>
        <p className="mt-1 text-sm text-muted">{isAdminEntry ? "관리자 로그인" : "로그인"}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <label htmlFor="keep-login" className="-mx-2 flex min-h-11 cursor-pointer items-center gap-3 px-2 text-sm text-ink">
            <Checkbox id="keep-login" checked={keepLogin} onCheckedChange={(v) => setKeepLogin(v === true)} className="h-6 w-6 rounded-md" />
            로그인 유지
          </label>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "로그인 중…" : "로그인"}
          </Button>
        </form>
        {onSignup && (
          <button type="button" onClick={onSignup} className="mt-4 w-full text-center text-sm font-medium text-accent">
            회원가입
          </button>
        )}
      </div>
    </main>
  );
}
