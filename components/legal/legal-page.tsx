import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

// 이용약관·개인정보처리방침 공용 틀(정적 페이지). 운영자가 채울 칸은 <Fill>로 눈에 띄게 표시한다.

export function Fill({ children }: { children: ReactNode }) {
  return <span className="rounded bg-warn-bg px-1 font-semibold text-warn">{children}</span>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="-ml-1 inline-flex items-center gap-1 py-2 text-sm font-semibold text-muted">
        <ChevronLeft className="size-5" />
        돌아가기
      </Link>
      <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
      <p className="mt-3 rounded-xl bg-warn-bg px-4 py-3 text-sm font-semibold text-warn">
        초안 — 운영 전 검토 필요. 노란 칸은 운영자가 채울 내용이에요.
      </p>
      <div className="mt-4 space-y-3">{children}</div>
    </main>
  );
}
