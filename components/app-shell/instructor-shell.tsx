"use client";

import { useEffect, useRef, useState } from "react";
import { PushSettingsCard } from "@/components/notifications/push-settings-card";
import type { FocusRequest } from "@/components/shared/use-focus-item";
import type { NavIntent } from "@/lib/notifications/link";
import { toast } from "sonner";
import { Briefcase, FileText, Home, Inbox, Send } from "lucide-react";
import { DocumentList } from "@/components/verification/document-list";
import { Button } from "@/components/ui/button";
import { fetchMyInstructorProfile } from "@/lib/talent-profile/api";
import { resumeCompleteness } from "@/lib/talent-profile/logic";
import type { InstructorProfile } from "@/lib/talent-profile/types";
import { fetchMyDocuments } from "@/lib/verification/api";
import { DOC_TYPES } from "@/lib/verification/config";
import { displayStatus, latestByType, todayKst } from "@/lib/verification/logic";
import { useAuth } from "@/lib/app-shell/auth-provider";
import { JobsBrowser } from "@/components/app-shell/public/public-pages";
import { ApplySheet } from "@/components/jobs/apply-sheet";
import { MyApplications } from "@/components/jobs/my-applications";
import { useMyApplications } from "@/components/jobs/use-my-applications";
import { myApplicationCounts } from "@/lib/jobs/logic";
import type { JobSummary } from "@/lib/jobs/types";
import { ResumeEditor } from "@/components/talent-profile/resume-editor";
import { ReceivedOffers } from "@/components/offers/received-offers";
import { useReceivedOffers } from "@/components/offers/use-offers";
import { leaveToRoot } from "@/lib/navigation/use-navigable";

type Tab = "home" | "jobs" | "offers" | "applications" | "resume";

/** 알림에서 온 이동 요청(셸 라우터가 준다). seq가 바뀔 때마다 한 번 적용한다 */
export type InstructorNav = Extract<NavIntent, { role: "instructor" }> & { seq: number };

const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: "home", label: "홈", icon: Home },
  { key: "jobs", label: "공고", icon: Briefcase },
  { key: "offers", label: "제안", icon: Inbox },
  { key: "applications", label: "지원 현황", icon: Send },
  { key: "resume", label: "내 이력서", icon: FileText },
];

function HomeTab({
  onResume,
  counts,
  countsError,
  onRetryCounts,
  onApplications,
  pendingOffers,
  onOffers,
}: {
  onResume: () => void;
  /** selected = 선택된 지원 + 수락한 제안 */
  counts: { active: number; total: number; selected: number } | null;
  /** 답을 기다리는 받은 제안 수(모르면 null) */
  pendingOffers: number | null;
  onOffers: () => void;
  countsError: boolean;
  onRetryCounts: () => void;
  onApplications: () => void;
}) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<InstructorProfile | null>(null);
  const [docs, setDocs] = useState<{ submitted: number; verified: number; expiring: number; attention: number } | null>(null);
  const [docError, setDocError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchMyInstructorProfile()
      .then((p) => !cancelled && setProfile(p))
      .catch(() => {});
    setDocError(false);
    fetchMyDocuments()
      .then((list) => {
        if (cancelled) return;
        const today = todayKst();
        // attention = 반려 + 만료. 곧 만료는 확인됨에 세고 따로 안내한다.
        const out = { submitted: 0, verified: 0, expiring: 0, attention: 0 };
        // 강사·센터 역할을 함께 가진 계정은 센터 서류도 있으니 강사 서류만 센다
        for (const d of Object.values(latestByType(list.filter((x) => DOC_TYPES[x.docType].owner === "instructor")))) {
          const st = displayStatus(d, today);
          if (st === "submitted") out.submitted++;
          else if (st === "rejected" || st === "expired") out.attention++;
          else if (st === "verified") out.verified++;
          else if (st === "expiring") {
            out.verified++;
            out.expiring++;
          }
        }
        setDocs(out);
      })
      .catch(() => {
        if (!cancelled) setDocError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

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
        <h2 className="text-lg font-bold text-ink">내 지원</h2>
        {pendingOffers != null && pendingOffers > 0 && (
          <button
            type="button"
            onClick={onOffers}
            className="mt-3 w-full rounded-xl bg-surface py-3 text-center text-sm font-semibold text-ink"
          >
            답을 기다리는 제안 {pendingOffers}건
          </button>
        )}
        {counts ? (
          <>
            {counts.selected > 0 && (
              <button
                type="button"
                onClick={onApplications}
                className="mt-3 w-full rounded-xl bg-ok-bg py-3 text-center text-sm font-semibold text-ok"
              >
                선택·수락 {counts.selected}건 확인하기
              </button>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-surface py-3">
                <div className="text-xl font-bold text-ink">{counts.active}</div>
                <div className="text-xs text-muted">지원 중</div>
              </div>
              <div className="rounded-xl bg-surface py-3">
                <div className="text-xl font-bold text-ink">{counts.total}</div>
                <div className="text-xs text-muted">총 지원</div>
              </div>
            </div>
          </>
        ) : countsError ? (
          <div className="mt-2 flex items-center justify-between gap-3 text-sm text-muted">
            지원 현황을 불러오지 못했어요
            <button type="button" onClick={onRetryCounts} className="font-semibold text-ink underline">
              다시 시도
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">불러오는 중…</p>
        )}
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
              <div className="text-xl font-bold text-warn">{docs.attention}</div>
              <div className="text-xs text-warn">반려·만료</div>
            </div>
          </div>
        ) : docError ? (
          <div className="mt-2 flex items-center justify-between gap-3 text-sm text-muted">
            서류 상태를 불러오지 못했어요
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold text-ink underline">
              다시 시도
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">불러오는 중…</p>
        )}
        {docs && docs.expiring > 0 && <p className="mt-3 text-sm font-medium text-warn">곧 만료 {docs.expiring}건</p>}
      </section>

      <PushSettingsCard />

      <button type="button" onClick={() => void logout()} className="w-full py-3 text-center text-sm font-medium text-muted">
        로그아웃
      </button>
    </div>
  );
}

export function InstructorShell({ nav = null, onNavConsumed }: { nav?: InstructorNav | null; onNavConsumed?: () => void } = {}) {
  const [tab, setTab] = useState<Tab>("home");
  const [applying, setApplying] = useState<JobSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const my = useMyApplications();
  const rec = useReceivedOffers();
  const acceptedOffers = rec.offers.filter((o) => o.status === "accepted");
  const baseCounts = my.loading || my.error ? null : myApplicationCounts(my.apps);
  const counts = baseCounts && { ...baseCounts, selected: baseCounts.selected + acceptedOffers.length };
  const pendingOffers = rec.loading || rec.error ? null : rec.offers.filter((o) => o.status === "offered").length;
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [focusOffer, setFocusOffer] = useState<FocusRequest | null>(null);
  const mountedRef = useRef(false);
  const latestNavRef = useRef(0);
  const tabRef = useRef<Tab>("home");
  const [focusJob, setFocusJob] = useState<FocusRequest | null>(null);

  /**
   * 탭 이동(아래 탭·홈의 바로가기·다른 화면에서 탭으로): 작성 중이면 묻고, 덮는 화면·팝업을 모두 닫은 뒤 바꾼다.
   * before: 탭을 바꾸기 직전에 할 일(열 공고 등)
   */
  const goTab = (key: Tab, before?: () => void) =>
    leaveToRoot(() => {
      before?.();
      setTab(key);
    });

  // 알림 → 탭 이동 + 해당 항목. 이동한 화면의 데이터만 다시 불러온다(알림은 화면을 연 뒤에 왔을 수 있다).
  useEffect(() => {
    if (!nav) return;
    // 방금 열린 화면이면(역할 전환) 훅들이 이미 처음 불러오는 중이라 다시 부르지 않는다
    const fresh = !mountedRef.current;
    const seq = nav.seq;
    const target = nav.tab;
    latestNavRef.current = seq;
    tabRef.current = target;
    setApplying(null);
    setFocusOffer(null);
    setFocusJob(null);
    const offerFocus = target === "offers" && nav.offerId ? { id: nav.offerId, seq } : null;
    const jobFocus = target === "applications" && nav.jobId ? { id: nav.jobId, seq } : null;
    // 앱을 연 채 알림을 누르면 지금 목록에는 새 항목이 없거나 묶음(답 대기→마감, 지원함→선택)이 바뀌었을 수 있다.
    // → 다시 불러온 뒤에 찾기 요청을 건다(더 새 알림 이동이 있었거나 다른 탭으로 나갔으면 버림).
    const after = (p: Promise<unknown>, apply: () => void) =>
      void p.then(() => {
        if (latestNavRef.current === seq && tabRef.current === target) apply();
      });
    if (target === "offers") {
      if (fresh) setFocusOffer(offerFocus);
      else after(rec.reload(), () => setFocusOffer(offerFocus));
    }
    if (target === "applications") {
      if (fresh) setFocusJob(jobFocus);
      else after(Promise.all([my.reload(), rec.reload()]), () => setFocusJob(jobFocus));
    }
    if (nav.tab === "jobs") {
      setOpenJobId(nav.jobId);
      if (!fresh) setReloadKey((n) => n + 1);
    }
    setTab(nav.tab);
    onNavConsumed?.();
  }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps -- nav가 바뀔 때만 한 번

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  // 다른 탭으로 나가면 강조 요청을 버린다(돌아와도 다시 강조·안내하지 않게)
  useEffect(() => {
    tabRef.current = tab;
    if (tab !== "offers") setFocusOffer(null);
    if (tab !== "applications") setFocusJob(null);
  }, [tab]);
  // 이 공고로 받은 제안이 답 대기·수락이면 지원 대신 제안 탭으로(서버 apply_to_job도 막는다 — 화면은 안내만)
  const startApply = (job: JobSummary) => {
    const offer = rec.offers.find((o) => o.jobId === job.id && (o.status === "offered" || o.status === "accepted"));
    if (offer) {
      toast(offer.status === "offered" ? "이 공고로 받은 제안이 있어요. 받은 제안에서 답해 주세요" : "이 공고는 이미 제안을 수락했어요");
      goTab("offers");
      return;
    }
    setApplying(job);
  };
  return (
    <div className="mx-auto min-h-app w-full max-w-md">
      <main className="px-5 pb-28 pt-8">
        {tab === "home" && (
          <HomeTab
            onResume={() => goTab("resume")}
            counts={counts}
            countsError={my.error && !my.loading}
            onRetryCounts={() => void my.reload()}
            onApplications={() => goTab("applications")}
            pendingOffers={pendingOffers}
            onOffers={() => goTab("offers")}
          />
        )}
        {tab === "jobs" && <JobsBrowser key={openJobId ?? "list"} initialJobId={openJobId} onApply={startApply} reloadKey={reloadKey} />}
        {tab === "offers" && (
          <ReceivedOffers
            offers={rec.offers}
            loading={rec.loading}
            error={rec.error && !rec.loading}
            onRetry={() => void rec.reload()}
            onOpenJob={(id) => goTab("jobs", () => setOpenJobId(id))}
            onChanged={rec.reload}
            focus={focusOffer}
          />
        )}
        {tab === "applications" && (
          <MyApplications
            apps={my.apps}
            loading={my.loading}
            error={my.error}
            onRetry={() => void my.reload()}
            onOpenJob={(id) => goTab("jobs", () => setOpenJobId(id))}
            onChanged={my.reload}
            acceptedOffers={acceptedOffers}
            focusJob={focusJob}
          />
        )}
        {tab === "resume" && (
          <div className="space-y-4">
            <ResumeEditor />
            <DocumentList owner="instructor" />
          </div>
        )}
      </main>
      <ApplySheet
        job={applying}
        onClose={() => setApplying(null)}
        onApplied={async () => {
          setReloadKey((n) => n + 1);
          await my.reload();
        }}
        onOpenResume={() => goTab("resume")}
      />
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-md">
          {TABS.map(({ key, label, icon: Icon }) => (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => goTab(key, () => key === "jobs" && setOpenJobId(null))}
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
