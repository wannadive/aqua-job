"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Briefcase, FileCheck, Flag, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PushSettingsCard } from "@/components/notifications/push-settings-card";
import { fetchMembers, type MemberRow } from "@/lib/app-shell/account/admin-api";
import { kstDate, ROLE_LABEL } from "@/lib/verification/admin-logic";
import { useAuth } from "@/lib/app-shell/auth-provider";
import { ReviewQueue } from "@/components/verification/admin/review-queue";
import { AdminJobs } from "@/components/jobs/admin/admin-jobs";
import { AdminReports } from "@/components/moderation/admin-reports";
import { MemberActions } from "@/components/moderation/member-actions";
import { closeOverlays, confirmLeaveAll, leaveToRoot } from "@/lib/navigation/use-navigable";

type Tab = "review" | "jobs" | "reports" | "members" | "settings";

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "review", label: "서류 확인", icon: FileCheck },
  { key: "jobs", label: "공고", icon: Briefcase },
  { key: "reports", label: "신고", icon: Flag },
  { key: "members", label: "회원", icon: Users },
  { key: "settings", label: "설정", icon: Settings },
];

const STATUS_LABEL: Record<MemberRow["accountStatus"], string> = { active: "활동", suspended: "정지", banned: "퇴출" };

function MembersTab({ adminId }: { adminId: string | null }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 조치 뒤: 회원 목록만 다시 읽는다(실패하면 지금 목록을 두고 안내만)
  const reloadMembers = useCallback(async () => {
    try {
      const l = await fetchMembers();
      if (alive.current) setRows(l);
    } catch {
      if (alive.current) toast.error("회원 목록을 새로 불러오지 못했어요");
    }
  }, []);

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
            <li key={m.id} className="space-y-3 px-5 py-4">
              <div className="flex items-center gap-3">
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
              </div>
              {/* 관리자 계정 · 나 자신은 버튼 없음(서버도 42501로 막는다) */}
              <MemberActions member={m} adminId={adminId} onChanged={reloadMembers} />
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
        <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => {
            // 작성 중인 내용이 있으면 먼저 묻는다
            if (confirmLeaveAll()) void logout();
          }}>
          로그아웃
        </Button>
      </section>
      <PushSettingsCard />
    </div>
  );
}

export function AdminShell() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("review");
  // 관리자 화면 데이터(신고·회원)는 이 셸 안에만 둔다 — 역할 전환·로그아웃으로 셸이 사라지면 함께 버려지고,
  // 계정이 바뀌면 key로 새로 만든다.
  const adminId = user?.id ?? null;
  return (
    <div className="mx-auto min-h-app w-full max-w-md">
      <main className="px-5 pb-28 pt-8">
        {tab === "review" && <ReviewQueue />}
        {tab === "jobs" && <AdminJobs key={adminId ?? "none"} adminId={adminId} />}
        {tab === "reports" && adminId && <AdminReports key={adminId} adminId={adminId} />}
        {tab === "members" && <MembersTab key={adminId ?? "none"} adminId={adminId} />}
        {tab === "settings" && <SettingsTab />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-md">
          {TABS.map(({ key, label, icon: Icon }) => (
            <li key={key} className="flex-1">
              <button
                type="button"
                // 작성 중이면 묻고, 덮는 화면(서류 상세 등)·팝업을 모두 닫은 뒤 탭을 바꾼다
                onClick={() => (key === tab ? closeOverlays() : leaveToRoot(() => setTab(key)))}
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
