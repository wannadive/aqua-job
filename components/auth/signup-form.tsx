"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SignupInput } from "@/lib/account/types";
import { useAuth } from "@/lib/supabase/auth-provider";

export function SignupForm({ role, onBack }: { role: SignupInput["role"]; onBack: () => void }) {
  const { signup } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameLabel = role === "center" ? "센터명" : "이름";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !email.trim() || !phone.trim() || !password) {
      toast.error("모든 항목을 입력해 주세요");
      return;
    }
    if (password.length < 6) {
      toast.error("비밀번호는 6자 이상이어야 해요");
      return;
    }
    if (!agreed) {
      toast.error("약관에 동의해 주세요");
      return;
    }
    setBusy(true);
    const res = await signup({ role, email, password, displayName, phone });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-card bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-ink">{role === "center" ? "센터 회원가입" : "강사 회원가입"}</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">{nameLabel}</Label>
            <Input id="name" autoComplete={role === "center" ? "organization" : "name"} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">휴대폰</Label>
            <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호 (6자 이상)</Label>
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Checkbox id="agree" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
              <Label htmlFor="agree" className="text-sm">이용약관과 개인정보 처리에 동의해요 (필수)</Label>
            </div>
            {/* 새 탭으로 열어 적던 가입 내용이 사라지지 않게 한다 */}
            <p className="pl-6 text-xs text-muted">
              <a href="/terms" target="_blank" rel="noopener" className="underline">
                이용약관
              </a>
              {" · "}
              <a href="/privacy" target="_blank" rel="noopener" className="underline">
                개인정보처리방침
              </a>{" "}
              보기
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "가입 중…" : "가입하기"}
          </Button>
        </form>
        <button type="button" onClick={onBack} className="mt-4 w-full text-center text-sm font-medium text-muted">
          뒤로
        </button>
      </div>
    </main>
  );
}
