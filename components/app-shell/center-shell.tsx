"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PushSettingsCard } from "@/components/notifications/push-settings-card";
import type { FocusRequest } from "@/components/shared/use-focus-item";
import type { NavIntent } from "@/lib/notifications/link";
import { Briefcase, Home, Search, Settings, Users } from "lucide-react";
import { DocumentList } from "@/components/verification/document-list";
import { Applicants } from "@/components/jobs/applicants";
import { JobForm } from "@/components/jobs/job-form";
import { MyJobs } from "@/components/jobs/my-jobs";
import { summarize, useMyJobs } from "@/components/jobs/use-my-jobs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/app-shell/auth-provider";
import { fetchMyDocuments } from "@/lib/verification/api";
import { displayStatus, latestByType, todayKst } from "@/lib/verification/logic";
import type { DocDisplayStatus } from "@/lib/verification/types";
import { CenterProfileForm } from "@/components/center-listing/center-profile-form";
import { InstructorFinder } from "@/components/offers/instructor-finder";
import { useSentOffers } from "@/components/offers/use-offers";
import { filledCount } from "@/lib/offers/logic";

type Tab = "home" | "jobs" | "applicants" | "instructors" | "settings";

/** 알림에서 온 이동 요청(셸 라우터가 준다). seq가 바뀔 때마다 한 번 적용한다 */
export type CenterNav = Extract<NavIntent, { role: "center" }> & { seq: number };

const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: "home", label: "홈", icon: Home },
  { key: "jobs", label: "공고", icon: Briefcase },
  { key: "applicants", label: "지원자", icon: Users },
  { key: "instructors", label: "강사 찾기", icon: Search },
  { key: "settings", label: "설정", icon: Settings },
];

function HomeTab({
  onSubmitDocs,
  onNewJob,
  onFindInstructors,
  stats,
}: {
  onSubmitDocs: () => void;
  onNewJob: () => void;
  onFindInstructors: () => void;
  stats: { open: number; applied: number; total: number } | null;
}) {
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

  const statCards: [string, number | null][] = [
    ["진행중 공고", stats?.open ?? null],
    ["대기 지원자", stats?.applied ?? null],
    ["총 지원자", stats?.total ?? null],
  ];

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
          {statCards.map(([label, n]) => (
            <div key={label} className="rounded-xl bg-surface py-3">
              <div className="text-xl font-bold text-ink">{n ?? "–"}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">빠른 메뉴</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onNewJob} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl bg-surface text-sm font-semibold text-ink">
            <Briefcase className="size-5" /> 공고 등록
          </button>
          <button type="button" onClick={onFindInstructors} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl bg-surface text-sm font-semibold text-ink">
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
      <PushSettingsCard />
    </div>
  );
}

type Overlay = { kind: "new" } | { kind: "edit"; jobId: string } | null;

export function CenterShell({ nav = null, onNavConsumed }: { nav?: CenterNav | null; onNavConsumed?: () => void } = {}) {
  const [tab, setTab] = useState<Tab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);
  // 지원자 탭의 공고 필터(null = 전체). 공고 카드 [지원자 보기]는 그 공고로 연다.
  const [applicantJob, setApplicantJob] = useState<string | null>(null);
  const changeApplicantJob = useCallback((id: string | null) => setApplicantJob(id), []);
  const my = useMyJobs();
  const stats = my.loading || my.error ? null : summarize(my.jobs, my.counts);
  const sent = useSentOffers(
    my.jobs.map((j) => j.id),
    !my.loading && !my.error,
  );
  const reloadJobs = my.reload;
  const reloadOffers = sent.reload;
  // 새로 읽은 공고를 돌려준다(지원자 탭이 마감 안내를 갓 읽은 상태로 판단)
  const reloadBoth = useCallback(async () => {
    const [jobs] = await Promise.all([reloadJobs(), reloadOffers()]);
    return jobs;
  }, [reloadJobs, reloadOffers]);
  const editJob = overlay?.kind === "edit" ? my.jobs.find((j) => j.id === overlay.jobId) : undefined;
  const [focusApp, setFocusApp] = useState<FocusRequest | null>(null);
  const [focusJob, setFocusJob] = useState<FocusRequest | null>(null);
  // 지원자 탭을 알림으로 열 때마다 새로 그려 지원 목록을 다시 읽게 한다
  const [applicantsKey, setApplicantsKey] = useState(0);
  const mountedRef = useRef(false);

  // 알림 → 탭 이동 + 해당 항목. 이동한 화면의 데이터만 다시 불러온다.
  useEffect(() => {
    if (!nav) return;
    // 방금 열린 화면이면(역할 전환) 훅들이 이미 처음 불러오는 중이라 다시 부르지 않는다
    const fresh = !mountedRef.current;
    setOverlay(null);
    setFocusApp(nav.tab === "applicants" && nav.appId ? { id: nav.appId, seq: nav.seq } : null);
    setFocusJob(nav.tab === "jobs" && nav.jobId ? { id: nav.jobId, seq: nav.seq } : null);
    if (nav.tab === "applicants") {
      setApplicantJob(nav.jobId);
      setApplicantsKey(nav.seq);
      if (!fresh) void reloadBoth();
    }
    if (!fresh && nav.tab === "jobs") void reloadJobs();
    setTab(nav.tab);
    onNavConsumed?.();
  }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps -- nav가 바뀔 때만 한 번

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    if (tab !== "applicants") setFocusApp(null);
    if (tab !== "jobs") setFocusJob(null);
  }, [tab]);

  if (overlay) {
    return (
      <div className="mx-auto min-h-app w-full max-w-md">
        <main className="px-5 pb-10 pt-4">
          <JobForm
            editJobId={overlay.kind === "edit" ? overlay.jobId : null}
            onClose={() => setOverlay(null)}
            onSaved={my.reload}
            selectedCount={editJob ? filledCount(editJob) : 0}
            onSubmitDocs={() => {
              setOverlay(null);
              setTab("settings");
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-app w-full max-w-md">
      <main className="px-5 pb-28 pt-8">
        {tab === "home" && (
          <HomeTab
            onSubmitDocs={() => setTab("settings")}
            onNewJob={() => setOverlay({ kind: "new" })}
            onFindInstructors={() => setTab("instructors")}
            stats={stats}
          />
        )}
        {tab === "jobs" && (
          <MyJobs
            jobs={my.jobs}
            counts={my.counts}
            loading={my.loading}
            error={my.error}
            onRetry={() => void my.reload()}
            onNew={() => setOverlay({ kind: "new" })}
            onEdit={(j) => setOverlay({ kind: "edit", jobId: j.id })}
            onApplicants={(j) => {
              setApplicantJob(j.id);
              setTab("applicants");
            }}
            onChanged={my.reload}
            focusJob={focusJob}
          />
        )}
        {tab === "applicants" && (
          <Applicants
            key={applicantsKey}
            focusApp={focusApp}
            jobs={my.jobs}
            jobsLoading={my.loading}
            jobsError={my.error}
            onRetryJobs={() => void my.reload()}
            jobFilter={applicantJob}
            onJobFilterChange={changeApplicantJob}
            onChanged={reloadBoth}
            acceptedOffers={sent.offers.filter((o) => o.status === "accepted")}
            offersError={sent.error && !my.loading && !my.error}
            offersLoading={sent.loading}
            onRetryOffers={() => void sent.reload()}
          />
        )}
        {tab === "instructors" && (
          <InstructorFinder
            jobs={my.jobs}
            jobsLoading={my.loading}
            jobsError={my.error}
            onRetryJobs={() => void my.reload()}
            offers={sent.offers}
            offersLoading={sent.loading}
            offersError={sent.error}
            reloadOffers={reloadOffers}
            reloadJobs={reloadJobs}
            onNewJob={() => setOverlay({ kind: "new" })}
            onApplicants={(jobId) => {
              setApplicantJob(jobId);
              setTab("applicants");
            }}
          />
        )}
        {tab === "settings" && <SettingsTab />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-md">
          {TABS.map(({ key, label, icon: Icon }) => (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => {
                  if (key === "applicants") setApplicantJob(null);
                  setTab(key);
                }}
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
