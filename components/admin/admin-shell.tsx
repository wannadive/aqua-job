"use client";

import { useEffect, useState } from "react";
import { FileCheck, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchMembers, type MemberRow } from "@/lib/account/admin-api";
import { kstDate, ROLE_LABEL } from "@/lib/verification/admin-logic";
import { useAuth } from "@/lib/supabase/auth-provider";
import { ReviewQueue } from "./review-queue";

type Tab = "review" | "members" | "settings";

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "review", label: "서류 확인", icon: FileCheck },
  { key: "members", label: "회원", icon: Users },
  { key: "settings", label: "설정", icon: Settings },
];

const STATUS_LABEL: Record<MemberRow["accountStatus"], string> = { active: "활동", suspended: "정지", banned: "차단" };

function MembersTab() {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    fetchMembers()
      .then((l) => !cancelled && setRows(l))
      .catch(() => {
        if (!cancelled) {
          toast.error("회원 목록을 불러오지 못했어요");
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">회원</h1>
        <p className="mt-1 text-sm text-muted">{rows ? `${rows.length}명 · 최근 가입 순` : "회원 목록"}</p>
      </div>
      {loadError ? (
        <div className="rounded-card bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-muted">회원 목록을 불러오지 못했어요</p>
          <Button variant="outline" className="mt-3 h-12" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </Button>
        </div>
      ) : !rows ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-sm">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-ink">{m.displayName}</div>
                <div className="mt-0.5 text-xs text-muted">가입 {kstDate(m.createdAt)}</div>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted">
                {m.roles.map((r) => ROLE_LABEL[r]).join("·")}
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.accountStatus === "active" ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}
              >
                {STATUS_LABEL[m.accountStatus]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsTab() {
  const { user, logout } = useAuth();
  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">설정</h1>
      <section className="rounded-card bg-white p-5 shadow-sm">
        <p className="text-sm text-muted">{user?.displayName} (관리자)</p>
        <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => void logout()}>
          로그아웃
        </Button>
      </section>
    </div>
  );
}

export function AdminShell() {
  const [tab, setTab] = useState<Tab>("review");
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md">
      <main className="px-5 pb-28 pt-8">
        {tab === "review" && <ReviewQueue />}
        {tab === "members" && <MembersTab />}
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
