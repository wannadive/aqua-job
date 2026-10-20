"use client";

import { useEffect, useState } from "react";
import { Briefcase, Home, Search, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/supabase/auth-provider";
import { fetchMyDocuments } from "@/lib/verification/api";
import { displayStatus, latestByType, missingRequirements } from "@/lib/verification/logic";
import type { DocType } from "@/lib/verification/types";
import { CenterProfileForm } from "./center-profile-form";

type Tab = "home" | "jobs" | "applicants" | "instructors" | "settings";

const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: "home", label: "홈", icon: Home },
  { key: "jobs", label: "공고", icon: Briefcase },
  { key: "applicants", label: "지원자", icon: Users },
  { key: "instructors", label: "강사 찾기", icon: Search },
  { key: "settings", label: "설정", icon: Settings },
];

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">곧 열려요</p>
    </div>
  );
}

function HomeTab({ onSubmitDocs }: { onSubmitDocs: () => void }) {
  const { user, logout } = useAuth();
  // null = 아직 모름(안내 카드를 띄우지 않음), true = 사업자등록증 확인 전
  const [needsBizDoc, setNeedsBizDoc] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyDocuments()
      .then((list) => {
        if (cancelled) return;
        const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
        const verified: DocType[] = Object.values(latestByType(list))
          .filter((d) => {
            const st = displayStatus(d, today);
            return st === "verified" || st === "expiring";
          })
          .map((d) => d.docType);
        setNeedsBizDoc(missingRequirements(verified, ["business_registration"]).length > 0);
      })
      .catch(() => {
        if (!cancelled) toast.error("서류 상태를 불러오지 못했어요");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const soon = () => toast("곧 열려요");

  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">
        {user?.displayName}님,
        <br />
        안녕하세요
      </h1>

      {needsBizDoc && (
        <section className="rounded-card bg-warn-bg p-5">
          <h2 className="text-lg font-bold text-warn">사업자등록증 확인 전</h2>
          <p className="mt-1 text-sm text-ink">사업자등록증이 확인되면 공고를 올리고 강사에게 제안할 수 있어요</p>
          <Button className="mt-4 h-[52px] w-full bg-ink text-base text-white" onClick={onSubmitDocs}>
            서류 제출하기
          </Button>
        </section>
      )}

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">현황</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ["진행중 공고", 0],
            ["대기 지원자", 0],
            ["총 지원자", 0],
          ].map(([label, n]) => (
            <div key={label} className="rounded-xl bg-surface py-3">
              <div className="text-xl font-bold text-ink">{n}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">빠른 메뉴</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={soon} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl bg-surface text-sm font-semibold text-ink">
            <Briefcase className="size-5" /> 공고 등록
          </button>
          <button type="button" onClick={soon} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl bg-surface text-sm font-semibold text-ink">
            <Search className="size-5" /> 강사 찾기
          </button>
        </div>
      </section>

      <button type="button" onClick={() => void logout()} className="w-full py-3 text-center text-sm font-medium text-muted">
        로그아웃
      </button>
    </div>
  );
}

function SettingsTab() {
  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">설정</h1>
      <CenterProfileForm />
      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">서류</h2>
        <p className="mt-2 text-sm text-muted">곧 열려요</p>
      </section>
    </div>
  );
}

export function CenterShell() {
  const [tab, setTab] = useState<Tab>("home");
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md">
      <main className="px-5 pb-28 pt-8">
        {tab === "home" && <HomeTab onSubmitDocs={() => setTab("settings")} />}
        {tab === "jobs" && <ComingSoon title="공고" />}
        {tab === "applicants" && <ComingSoon title="지원자" />}
        {tab === "instructors" && <ComingSoon title="강사 찾기" />}
        {tab === "settings" && <SettingsTab />}
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
