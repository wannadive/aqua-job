"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FOCUS_MISSING_TEXT, focusRing, useFocusItem, type FocusRequest } from "@/components/shared/use-focus-item";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { listApplicantsForJobs, selectApplicant } from "@/lib/jobs/api";
import { canSelect, filterApplicants, formatAppliedAt } from "@/lib/jobs/applicants";
import { filledCount } from "@/lib/offers/logic";
import type { Offer } from "@/lib/offers/types";
import { sortOpenFirst } from "@/lib/jobs/logic";
import type { JobApplication, JobSummary } from "@/lib/jobs/types";
import { ApplicantContact } from "./applicant-contact";
import { ApplicantResume } from "./applicant-resume";
import { useNavigableValue, useLeaveGuard } from "@/lib/navigation/use-navigable";

const CHIP: Record<JobApplication["status"], { label: string; cls: string }> = {
  applied: { label: "지원함", cls: "bg-surface text-ink" },
  selected: { label: "선택됨", cls: "bg-ok-bg text-ok" },
  not_selected: { label: "미선택", cls: "bg-surface text-muted" },
  withdrawn: { label: "취소함", cls: "bg-surface text-muted" },
};

/**
 * 센터 지원자 탭: 내 모든 공고의 지원자 + 제안을 수락한 강사("제안 수락") + 공고 필터 칩.
 * 연락처는 선택된 지원자·제안 수락 강사 카드에서 [연락처 보기]를 누르거나 방금 선택했을 때만 ApplicantContact가 불러온다(미리 불러오지 않음).
 * 채운 인원(선택 + 수락한 제안)은 서버 요약의 남은 자리로 본다(filledCount).
 */
export function Applicants({
  jobs,
  jobsLoading,
  jobsError,
  onRetryJobs,
  jobFilter,
  onJobFilterChange,
  onChanged,
  acceptedOffers = [],
  offersError = false,
  offersLoading = false,
  onRetryOffers,
  focusApp = null,
  viewerId = null,
}: {
  /** 지금 로그인한 (활성) 회원 id — 이력서 [신고하기]에만 쓴다 */
  viewerId?: string | null;
  jobs: JobSummary[];
  /** 알림에서 온 지원(새 지원자) — 강조 */
  focusApp?: FocusRequest | null;
  jobsLoading: boolean;
  jobsError: boolean;
  onRetryJobs: () => void;
  /** null = 전체 */
  jobFilter: string | null;
  onJobFilterChange: (jobId: string | null) => void;
  /** 선택 뒤 공고·현황 숫자(·제안) 다시 불러오기. 새로 읽은 공고를 돌려주면 마감 안내를 그것으로 판단한다 */
  onChanged: () => Promise<JobSummary[] | null | void> | void;
  /** 제안 수락 강사 목록을 읽는 중 */
  offersLoading?: boolean;
  /** 내 공고로 보낸 제안 중 수락된 것(009) */
  acceptedOffers?: Offer[];
  offersError?: boolean;
  onRetryOffers?: () => void;
}) {
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 지원자 이력서(덮는 화면): 방문 기록 한 칸 — 폰 뒤로가기·[뒤로]가 같은 길로 닫는다
  const [resumeOf, setResumeOf] = useNavigableValue<JobApplication>("v_appresume");
  const [selecting, setSelecting] = useState<JobApplication | null>(null);
  const [busy, setBusy] = useState(false);
  // 처리하는 중에는 확인 창을 닫는 폰 뒤로가기를 조용히 되돌린다(창과 기록 칸이 어긋나지 않게, 15초 상한) — 시트와 같은 장치
  const guard = useLeaveGuard(false, { busy: busy && selecting !== null });
  const busyRef = useRef(false);
  const [contactOpen, setContactOpen] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const orderedJobs = useMemo(() => sortOpenFirst(jobs), [jobs]);
  const jobIdsKey = jobs.map((j) => j.id).join(",");

  const reload = useCallback(async (): Promise<JobApplication[] | null> => {
    const my = ++seq.current;
    setError(false);
    try {
      const list = await listApplicantsForJobs(jobIdsKey ? jobIdsKey.split(",") : []);
      if (my !== seq.current) return null;
      setApps(list);
      return list;
    } catch {
      if (my === seq.current) setError(true);
      return null;
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [jobIdsKey]);

  useEffect(() => {
    if (jobsLoading || jobsError) return;
    void reload();
  }, [reload, jobsLoading, jobsError]);

  // 필터한 공고가 목록에서 사라지면 전체로
  useEffect(() => {
    if (!jobsLoading && jobFilter && !jobById.has(jobFilter)) onJobFilterChange(null);
  }, [jobsLoading, jobFilter, jobById, onJobFilterChange]);

  // 지원 취소는 서버(RLS)가 주지 않는다(007). 화면도 한 번 더 거른다.
  // 목록에 없는 공고(지워짐·숨김)로 필터가 들어오면 '전체'로 본다 — 아래 효과가 필터를 되돌리기 전 한 번의 그리기에서도
  const activeFilter = jobFilter && jobById.has(jobFilter) ? jobFilter : null;
  const visible = filterApplicants(apps, { jobId: activeFilter });
  const visibleOffers = acceptedOffers.filter((o) => o.status === "accepted" && (activeFilter === null || o.jobId === activeFilter));
  const filteredJob = activeFilter ? jobById.get(activeFilter) : undefined;
  const highlight = useFocusItem(
    focusApp,
    !jobsLoading && !jobsError && !loading && !error,
    (id) => visible.some((a) => a.id === id),
    FOCUS_MISSING_TEXT,
  );

  const doSelect = async () => {
    const target = selecting;
    if (!target || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await selectApplicant(target.id);
      if (res.error) {
        // 이미 마감·취소 등으로 바뀌었을 수 있다: 창을 닫고 목록·숫자를 다시 불러온다
        toast.error(res.error);
        setSelecting(null);
        await Promise.all([reload(), onChanged()]);
        return;
      }
      setSelecting(null);
      toast.success("선택했어요. 연락처가 열렸어요");
      setContactOpen((s) => new Set(s).add(target.id));
      // 마감 안내는 선택 뒤 새로 읽은 공고 상태로만 판단한다(누르기 전 숫자로 추측하지 않음)
      const [, fresh] = await Promise.all([reload(), onChanged()]);
      const job = Array.isArray(fresh) ? fresh.find((j) => j.id === target.jobId) : undefined;
      if (job && job.status !== "open") {
        toast("모집 인원이 다 차서 공고가 마감됐어요");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (resumeOf) {
    return (
      <ApplicantResume instructorId={resumeOf.instructorId} name={resumeOf.applicantName ?? "지원자"} onBack={() => setResumeOf(null)}
        reporterId={viewerId}
      />
    );
  }

  const listLoading = jobsLoading || (loading && !error) || (offersLoading && !jobsError);

  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">지원자</h1>

      {jobs.length > 0 && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {[{ id: null as string | null, label: "전체" }, ...orderedJobs.map((j) => ({ id: j.id as string | null, label: j.title }))].map((c) => (
            <button
              key={c.id ?? "all"}
              type="button"
              onClick={() => onJobFilterChange(c.id)}
              aria-pressed={activeFilter === c.id}
              className={`min-h-11 max-w-[14rem] shrink-0 truncate rounded-full px-4 text-sm font-semibold ${
                activeFilter === c.id ? "bg-ink text-white" : "bg-white text-ink shadow-sm"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {listLoading && <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>}
      {!jobsLoading && (jobsError || error) && (
        <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
          지원자를 불러오지 못했어요
          <button
            type="button"
            onClick={() => (jobsError ? onRetryJobs() : void reload())}
            className="font-semibold text-ink underline"
          >
            다시 시도
          </button>
        </div>
      )}
      {filteredJob && (
        <p className="text-sm font-semibold text-ink">
          선택·수락 {filledCount(filteredJob)}/{filteredJob.headcount}명
        </p>
      )}
      {offersError && (
        <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
          제안을 수락한 강사를 불러오지 못했어요
          {onRetryOffers && (
            <button type="button" onClick={onRetryOffers} className="font-semibold text-ink underline">
              다시 시도
            </button>
          )}
        </div>
      )}

      {!listLoading &&
        !jobsError &&
        visibleOffers.map((o) => {
          const job = jobById.get(o.jobId);
          const key = `o:${o.id}`;
          const showContact = contactOpen.has(key);
          return (
            <article key={key} className="rounded-card bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-ink">{o.instructorName ?? "강사"}</h2>
                  <p className="truncate text-sm text-muted">{job?.title ?? "공고"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">제안 수락</span>
              </div>
              {o.message && (
                <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-surface p-3 text-sm text-ink">
                  <span className="block text-xs font-semibold text-muted">보낸 한마디</span>
                  {o.message}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">{formatAppliedAt(o.respondedAt ?? o.createdAt)} 수락</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-11 border-line text-base"
                  onClick={() => {
                    setContactOpen(new Set());
                    setResumeOf({
                      id: key,
                      jobId: o.jobId,
                      instructorId: o.instructorId,
                      message: null,
                      status: "selected",
                      createdAt: o.createdAt,
                      decidedAt: o.respondedAt,
                      applicantName: o.instructorName,
                    });
                  }}
                >
                  이력서 보기
                </Button>
                <Button
                  variant="outline"
                  className="h-11 border-line text-base"
                  disabled={showContact}
                  onClick={() => setContactOpen((s) => new Set(s).add(key))}
                >
                  연락처 보기
                </Button>
              </div>
              {showContact && <ApplicantContact offerId={o.id} />}
            </article>
          );
        })}

      {!listLoading && !jobsError && !error && visible.length === 0 && visibleOffers.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">{jobs.length === 0 ? "올린 공고가 없어요" : "아직 지원자가 없어요"}</p>
      )}

      {!listLoading &&
        !jobsError &&
        !error &&
        visible.map((a) => {
          const job = jobById.get(a.jobId);
          const chip = CHIP[a.status];
          const selectable = canSelect(a, job, job ? filledCount(job) : 0);
          const showContact = a.status === "selected" && contactOpen.has(a.id);
          return (
            <article
              key={a.id}
              data-focus-id={a.id}
              className={`rounded-card bg-white p-5 shadow-sm ${focusRing(highlight === a.id)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-ink">{a.applicantName ?? "지원자"}</h2>
                  <p className="truncate text-sm text-muted">{job?.title ?? "공고"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${chip.cls}`}>{chip.label}</span>
              </div>
              {a.message && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-surface p-3 text-sm text-ink">{a.message}</p>}
              <p className="mt-2 text-xs text-muted">{formatAppliedAt(a.createdAt)} 지원</p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className={`h-11 border-line text-base ${selectable || a.status === "selected" ? "" : "col-span-2"}`}
                  onClick={() => {
                    setContactOpen(new Set());
                    setResumeOf(a);
                  }}
                >
                  이력서 보기
                </Button>
                {selectable && (
                  <Button className="h-11 bg-ink text-base text-white" disabled={busy} onClick={() => setSelecting(a)}>
                    선택하기
                  </Button>
                )}
                {a.status === "selected" && (
                  <Button
                    variant="outline"
                    className="h-11 border-line text-base"
                    disabled={showContact}
                    onClick={() => setContactOpen((s) => new Set(s).add(a.id))}
                  >
                    연락처 보기
                  </Button>
                )}
              </div>
              {showContact && <ApplicantContact appId={a.id} />}
            </article>
          );
        })}

      <Dialog open={selecting !== null} onOpenChange={(v) => !v && !guard.isSending() && setSelecting(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>{selecting?.applicantName ?? "이 지원자"}님을 선택할까요?</DialogTitle>
          <DialogDescription>선택하면 이 강사의 연락처가 열리고 되돌릴 수 없어요</DialogDescription>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 border-line" disabled={busy} onClick={() => setSelecting(null)}>
              취소
            </Button>
            <Button className="h-11 bg-ink text-white" disabled={busy} onClick={() => void doSelect()}>
              선택하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
