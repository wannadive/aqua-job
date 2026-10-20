"use client";

import { useEffect, useState } from "react";
import { Briefcase, FileText, Home, Inbox, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchMyDocSummary, fetchMyInstructorProfile } from "@/lib/instructor/api";
import { resumeCompleteness } from "@/lib/instructor/logic";
import type { InstructorProfile } from "@/lib/instructor/types";
import { useAuth } from "@/lib/supabase/auth-provider";
import { ResumeEditor } from "./resume-editor";

type Tab = "home" | "jobs" | "offers" | "applications" | "resume";

const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: "home", label: "홈", icon: Home },
  { key: "jobs", label: "공고", icon: Briefcase },
  { key: "offers", label: "제안", icon: Inbox },
  { key: "applications", label: "지원 현황", icon: Send },
  { key: "resume", label: "내 이력서", icon: FileText },
];

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">곧 열려요</p>
    </div>
  );
}

function HomeTab({ onResume }: { onResume: () => void }) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<InstructorProfile | null>(null);
  const [docs, setDocs] = useState<{ submitted: number; verified: number; rejected: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyInstructorProfile().then((p) => !cancelled && setProfile(p)).catch(() => {});
    fetchMyDocSummary().then((d) => !cancelled && setDocs(d)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const c = profile ? resumeCompleteness(profile) : null;
  const pct = c ? Math.round((c.done / c.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">
        {user?.displayName}님,
        <br />
        안녕하세요
      </h1>

      <section className="rounded-card bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-ink">이력서 완성도</h2>
          <span className="text-lg font-bold text-ok">{c ? `${pct}%` : "-"}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        {c && c.missing.length > 0 && <p className="mt-3 text-sm text-muted">비어 있는 항목: {c.missing.join(", ")}</p>}
        <Button className="mt-4 h-[52px] w-full bg-ink text-base text-white" onClick={onResume}>
          내 이력서 채우기
        </Button>
      </section>

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">서류 상태</h2>
        {docs ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-ok-bg py-3">
              <div className="text-xl font-bold text-ok">{docs.verified}</div>
              <div className="text-xs text-ok">확인됨</div>
            </div>
            <div className="rounded-xl bg-surface py-3">
              <div className="text-xl font-bold text-ink">{docs.submitted}</div>
              <div className="text-xs text-muted">확인 대기</div>
            </div>
            <div className="rounded-xl bg-warn-bg py-3">
              <div className="text-xl font-bold text-warn">{docs.rejected}</div>
              <div className="text-xs text-warn">반려됨</div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">불러오는 중…</p>
        )}
      </section>

      <button type="button" onClick={() => void logout()} className="w-full py-3 text-center text-sm font-medium text-muted">
        로그아웃
      </button>
    </div>
  );
}

export function InstructorShell() {
  const [tab, setTab] = useState<Tab>("home");
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md">
      <main className="px-5 pb-28 pt-8">
        {tab === "home" && <HomeTab onResume={() => setTab("resume")} />}
        {tab === "jobs" && <ComingSoon title="공고" />}
        {tab === "offers" && <ComingSoon title="제안" />}
        {tab === "applications" && <ComingSoon title="지원 현황" />}
        {tab === "resume" && <ResumeEditor />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-md">
          {TABS.map(({ key, label, icon: Icon }) => (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${tab === key ? "text-ink" : "text-muted"}`}
              >
                <Icon className="size-5" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
