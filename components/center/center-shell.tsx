"use client";

import { useEffect, useState } from "react";
import { Briefcase, Home, Search, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { DocumentList } from "@/components/documents/document-list";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/supabase/auth-provider";
import { fetchMyDocuments } from "@/lib/verification/api";
import { displayStatus, latestByType, todayKst } from "@/lib/verification/logic";
import type { DocDisplayStatus } from "@/lib/verification/types";
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
  // null = 아직 모름(안내 카드를 띄우지 않음)
  const [bizStatus, setBizStatus] = useState<{ st: DocDisplayStatus; reason: string | null } | null>(null);
  const [docError, setDocError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDocError(false);
    fetchMyDocuments()
      .then((list) => {
        if (cancelled) return;
        const d = latestByType(list).business_registration;
        setBizStatus({ st: displayStatus(d, todayKst()), reason: d?.rejectReason ?? null });
      })
      .catch(() => {
        if (!cancelled) setDocError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const bizTitle: Partial<Record<DocDisplayStatus, string>> = {
    missing: "사업자등록증 확인 전",
    submitted: "사업자등록증 확인 대기 중",
    rejected: "사업자등록증이 반려됐어요",
    expired: "사업자등록증이 만료됐어요",
  };
  const bizBody: Partial<Record<DocDisplayStatus, string>> = {
    missing: "사업자등록증이 확인되면 공고를 올리고 강사에게 제안할 수 있어요",
    submitted: "제출한 서류를 확인하고 있어요. 확인이 끝나면 이 화면에 표시돼요",
    rejected: "서류를 다시 올려 주세요",
    expired: "서류를 다시 올려 주세요",
  };
  const bizButton: Partial<Record<DocDisplayStatus, string>> = {
    missing: "서류 제출하기",
    submitted: "제출 내역 보기",
    rejected: "다시 올리기",
    expired: "다시 올리기",
  };

  const soon = () => toast("곧 열려요");

  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">
        {user?.displayName}님,
        <br />
        안녕하세요
      </h1>

      {docError && (
        <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
          서류 상태를 불러오지 못했어요
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      )}

      {bizStatus && bizTitle[bizStatus.st] && (
        <section className="rounded-card bg-warn-bg p-5">
          <h2 className="text-lg font-bold text-warn">{bizTitle[bizStatus.st]}</h2>
          <p className="mt-1 text-sm text-ink">{bizBody[bizStatus.st]}</p>
          {bizStatus.st === "rejected" && bizStatus.reason && <p className="mt-1 text-sm text-ink">반려 사유: {bizStatus.reason}</p>}
          <Button className="mt-4 h-[52px] w-full bg-ink text-base text-white" onClick={onSubmitDocs}>
            {bizButton[bizStatus.st]}
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
      <DocumentList owner="center" />
    </div>
  );
}

export function CenterShell() {
  const [tab, setTab] = useState<Tab>("home");
  return (
    <div className="mx-auto min-h-app w-full max-w-md">
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
