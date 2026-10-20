"use client";

import type { SignupInput } from "@/lib/account/types";

type Role = SignupInput["role"];

export function SignupSelect({ onSelect, onBack }: { onSelect: (role: Role) => void; onBack: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-ink">회원가입</h1>
      <button type="button" onClick={() => onSelect("instructor")} className="rounded-card bg-white p-5 text-left shadow-sm">
        <div className="text-base font-bold text-ink">강사 회원가입</div>
        <div className="mt-1 text-sm text-muted">공고를 찾고 센터에 지원하세요</div>
      </button>
      <button type="button" onClick={() => onSelect("center")} className="rounded-card bg-white p-5 text-left shadow-sm">
        <div className="text-base font-bold text-ink">센터 회원가입</div>
        <div className="mt-1 text-sm text-muted">강사를 찾고 공고를 등록하세요</div>
      </button>
      <button type="button" onClick={onBack} className="mt-2 text-center text-sm font-medium text-muted">
        로그인으로 돌아가기
      </button>
    </main>
  );
}
