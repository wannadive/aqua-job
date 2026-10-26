"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Share2 } from "lucide-react";
import { toast } from "sonner";
import { ReportButton } from "@/components/moderation/report-button";
import { Button } from "@/components/ui/button";
import { avatarUrl } from "@/lib/avatar/api";
import { fetchPaidMode, getJobSummary, getMyApplicationStatus, recordJobView, tryGetJobDetail } from "@/lib/jobs/api";
import { jobDisclaimer } from "@/lib/jobs/config";
import { closedNotice, isOwnJob } from "@/lib/jobs/logic";
import type { ApplicationStatus, JobDetail as JobDetailData, JobSummary, JobViewer } from "@/lib/jobs/types";
import { JobCard, JOB_STATUS_LABEL } from "./job-card";
import { LockedField } from "./locked-field";

const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "지원했어요 · 결과를 기다리는 중",
  selected: "선택됐어요",
  not_selected: "이번에는 선택되지 않았어요",
  withdrawn: "지원을 취소했어요",
};

export async function shareJobLink(jobId: string, title: string) {
  const url = `${window.location.origin}/jobs/${jobId}`;
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title, url });
      return;
    }
  } catch (e) {
    // 사용자가 공유창을 닫은 경우는 조용히 끝낸다
    if (e instanceof DOMException && e.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("링크를 복사했어요");
  } catch {
    toast.error("링크를 복사하지 못했어요");
  }
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-20 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
    </div>
  );
}

/**
 * 공고 상세. 요약은 누구나, 상세 설명·센터 상세는 서버(get_job_detail)가 허용했을 때만 그린다.
 * 허용되지 않으면 잠금 자리만 보인다(부분 내용 없음).
 */
export function JobDetail({
  jobId,
  viewer,
  onBack,
  onOpenCenter,
  onSignup,
  onApply,
  reloadKey = 0,
}: {
  jobId: string;
  viewer: JobViewer;
  onBack?: () => void;
  onOpenCenter: (centerId: string) => void;
  /** 비로그인 → 가입 화면 */
  onSignup: () => void;
  /** 지원하기(강사·진행중·열람 가능). 시트는 호출한 쪽이 연다 */
  onApply?: (job: JobSummary) => void;
  /** 바뀌면 내 지원 상태를 다시 읽는다(지원 직후) */
  reloadKey?: number;
}) {
  const [summary, setSummary] = useState<JobSummary | null | undefined>(undefined);
  const [detail, setDetail] = useState<JobDetailData | null>(null);
  const [locked, setLocked] = useState(true);
  const [paidMode, setPaidMode] = useState(false);
  const [error, setError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [appStatus, setAppStatus] = useState<ApplicationStatus | null>(null);
  const viewedRef = useRef<string | null>(null);
  const isInstructor = viewer.roles.includes("instructor");

  useEffect(() => {
    let cancelled = false;
    setSummary(undefined);
    setDetail(null);
    setLocked(true);
    setError(false);
    setDetailError(false);
    (async () => {
      try {
        const s = await getJobSummary(jobId);
        if (cancelled) return;
        setSummary(s);
        if (!s) return;
        if (viewedRef.current !== jobId) {
          viewedRef.current = jobId;
          void recordJobView(jobId);
        }
        if (!viewer.userId) return;
        const paid = await fetchPaidMode().catch(() => false);
        if (cancelled) return;
        setPaidMode(paid);
        try {
          const d = await tryGetJobDetail(jobId);
          if (cancelled) return;
          setLocked(d.locked || !d.detail);
          setDetail(d.detail);
        } catch {
          // 요약은 그대로 두고 상세 자리에서만 오류를 보여 준다
          if (!cancelled) setDetailError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, viewer.userId, attempt]);

  useEffect(() => {
    if (!viewer.userId || !isInstructor) {
      setAppStatus(null);
      return;
    }
    let cancelled = false;
    getMyApplicationStatus(jobId, viewer.userId)
      .then((s) => !cancelled && setAppStatus(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobId, viewer.userId, isInstructor, reloadKey]);

  const back = onBack && (
    <button type="button" onClick={onBack} className="-ml-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold text-ink">
      <ChevronLeft className="size-5" /> 목록
    </button>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
          공고를 불러오지 못했어요
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="ml-3 font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      </div>
    );
  }
  if (summary === undefined) {
    return (
      <div className="space-y-4">
        {back}
        <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>
      </div>
    );
  }
  if (summary === null) {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">찾을 수 없거나 내려간 공고예요</div>
      </div>
    );
  }

  // 구독 꼬리표는 로그인 + 유료 전환 후에만. 무료 기간에 잠겼다면 꼬리표 없이 안내만.
  const lockTag = !viewer.userId ? "가입하고 보기" : paidMode ? "구독하고 보기" : null;
  const lockAction = viewer.userId ? undefined : onSignup;
  const photos = (detail?.center.photoPaths ?? []).map((p) => avatarUrl(p)).filter((u): u is string => !!u);
  const open = summary.status === "open";
  // 겸용 계정(센터+강사)이 자기 공고를 볼 때: [지원하기] 대신 "내 공고"(서버 apply_to_job도 막는다)
  const mine = isOwnJob(summary, viewer.userId);

  let applyArea: React.ReactNode = null;
  if (mine) {
    applyArea = <p className="rounded-card bg-surface p-4 text-center text-sm font-semibold text-muted">내 공고예요</p>;
  } else if (!viewer.userId) {
    if (open)
      applyArea = (
        <Button className="h-[52px] w-full bg-ink text-base text-white" onClick={onSignup}>
          가입하고 지원하기
        </Button>
      );
  } else if (isInstructor) {
    if (appStatus && appStatus !== "withdrawn") {
      applyArea = <p className="rounded-card bg-ok-bg p-4 text-center text-sm font-semibold text-ok">{APP_STATUS_LABEL[appStatus]}</p>;
    } else if (open && !locked && onApply) {
      applyArea = (
        <Button className="h-[52px] w-full bg-ink text-base text-white" onClick={() => onApply(summary)}>
          지원하기
        </Button>
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {back ?? <span />}
        <button
          type="button"
          onClick={() => void shareJobLink(summary.id, summary.title)}
          className="flex h-11 items-center gap-1.5 px-2 text-sm font-semibold text-ink"
        >
          <Share2 className="size-4" /> 공유
        </button>
      </div>

      <JobCard job={summary} showStatus dimmed={!open} mine={mine} />
      {!open && <p className="text-sm text-muted">{closedNotice(summary.status) ?? `${JOB_STATUS_LABEL[summary.status]} 상태의 공고예요`}</p>}

      <button
        type="button"
        onClick={() => onOpenCenter(summary.centerId)}
        className="w-full rounded-card bg-white p-4 text-left text-sm font-semibold text-ink shadow-sm"
      >
        {summary.centerName} · 센터 프로필 보기
      </button>

      {detail && !locked ? (
        <>
          <section className="rounded-card bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink">상세 설명</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{detail.description}</p>
          </section>
          <section className="rounded-card bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink">센터 정보</h2>
            <dl className="mt-3 space-y-2">
              <Row label="대표자" value={detail.center.representativeName} />
              <Row label="대표 강사" value={detail.center.headInstructor} />
              <Row label="소속 강사" value={detail.center.instructorCount != null ? `${detail.center.instructorCount}명` : null} />
              <Row label="월 교육생" value={detail.center.monthlyStudents != null ? `${detail.center.monthlyStudents}명` : null} />
              <Row label="주 교육 장소" value={detail.center.venues.join(", ")} />
              <Row label="교육 요일" value={detail.center.teachingDays.join("·")} />
              <Row label="교육 시간대" value={detail.center.teachingTime} />
              <Row label="주소" value={detail.center.address} />
            </dl>
            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {photos.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <LockedField label="상세 설명" tag={lockTag} onAction={lockAction} />
          <LockedField label="센터 정보" tag={lockTag} onAction={lockAction} lines={4} />
          {detailError ? (
            <p className="text-center text-sm text-muted">
              상세를 불러오지 못했어요
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="ml-3 font-semibold text-ink underline">
                다시 시도
              </button>
            </p>
          ) : (
            viewer.userId && !paidMode && <p className="text-center text-xs text-muted">지금 이 계정으로는 상세를 볼 수 없어요</p>
          )}
        </>
      )}

      {applyArea}

      <p className="px-1 text-xs leading-relaxed text-muted">{jobDisclaimer(summary.centerName)}</p>

      {/* 신고: 로그인한 활성 회원 · 내 공고 아님(ownerId는 주인·관리자에게만 온다). 서버가 다시 확인한다 */}
      {viewer.userId && viewer.active === true && summary.ownerId !== viewer.userId && (
        <div className="flex justify-center">
          <ReportButton target={{ type: "job", id: summary.id, label: summary.title }} />
        </div>
      )}
    </div>
  );
}
