"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { listApplicantsForJobs, selectApplicant } from "@/lib/jobs/api";
import { canSelect, filterApplicants, formatAppliedAt, isJobFull, selectedCountFor } from "@/lib/jobs/applicants";
import { sortOpenFirst } from "@/lib/jobs/logic";
import type { JobApplication, JobSummary } from "@/lib/jobs/types";
import { ApplicantContact } from "./applicant-contact";
import { ApplicantResume } from "./applicant-resume";

const CHIP: Record<JobApplication["status"], { label: string; cls: string }> = {
  applied: { label: "지원함", cls: "bg-surface text-ink" },
  selected: { label: "선택됨", cls: "bg-ok-bg text-ok" },
  not_selected: { label: "미선택", cls: "bg-surface text-muted" },
  withdrawn: { label: "취소함", cls: "bg-surface text-muted" },
};

/**
 * 센터 지원자 탭: 내 모든 공고의 지원자 + 공고 필터 칩.
 * 연락처는 선택된 지원자 카드에서 [연락처 보기]를 누르거나 방금 선택했을 때만 ApplicantContact가 불러온다(미리 불러오지 않음).
 */
export function Applicants({
  jobs,
  jobsLoading,
  jobsError,
  onRetryJobs,
  jobFilter,
  onJobFilterChange,
  onChanged,
}: {
  jobs: JobSummary[];
  jobsLoading: boolean;
  jobsError: boolean;
  onRetryJobs: () => void;
  /** null = 전체 */
  jobFilter: string | null;
  onJobFilterChange: (jobId: string | null) => void;
  /** 선택 뒤 공고·현황 숫자 다시 불러오기 */
  onChanged: () => Promise<void> | void;
}) {
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [resumeOf, setResumeOf] = useState<JobApplication | null>(null);
  const [selecting, setSelecting] = useState<JobApplication | null>(null);
  const [busy, setBusy] = useState(false);
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

  const visible = filterApplicants(apps, { jobId: jobFilter, showWithdrawn });
  const withdrawnCount = filterApplicants(apps, { jobId: jobFilter, showWithdrawn: true }).length - filterApplicants(apps, { jobId: jobFilter, showWithdrawn: false }).length;

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
      const [list] = await Promise.all([reload(), onChanged()]);
      const job = jobById.get(target.jobId);
      if (list && job && isJobFull(job, selectedCountFor(list, target.jobId))) {
        toast("모집 인원이 다 차서 공고가 마감됐어요");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (resumeOf) {
    return (
      <ApplicantResume instructorId={resumeOf.instructorId} name={resumeOf.applicantName ?? "지원자"} onBack={() => setResumeOf(null)} />
    );
  }

  const listLoading = jobsLoading || (loading && !error);

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
              aria-pressed={jobFilter === c.id}
              className={`min-h-11 max-w-[14rem] shrink-0 truncate rounded-full px-4 text-sm font-semibold ${
                jobFilter === c.id ? "bg-ink text-white" : "bg-white text-ink shadow-sm"
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
      {!listLoading && !jobsError && !error && visible.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">{jobs.length === 0 ? "올린 공고가 없어요" : "아직 지원자가 없어요"}</p>
      )}

      {!listLoading &&
        !jobsError &&
        !error &&
        visible.map((a) => {
          const job = jobById.get(a.jobId);
          const chip = CHIP[a.status];
          const selectable = canSelect(a, job, selectedCountFor(apps, a.jobId));
          const showContact = a.status === "selected" && contactOpen.has(a.id);
          return (
            <article key={a.id} className={`rounded-card bg-white p-5 shadow-sm ${a.status === "withdrawn" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-ink">{a.applicantName ?? "지원자"}</h2>
                  <p className="truncate text-sm text-muted">{job?.title ?? "공고"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${chip.cls}`}>{chip.label}</span>
              </div>
              {a.message && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-surface p-3 text-sm text-ink">{a.message}</p>}
              <p className="mt-2 text-xs text-muted">{formatAppliedAt(a.createdAt)} 지원</p>

              {a.status !== "withdrawn" && (
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
              )}
              {showContact && <ApplicantContact appId={a.id} />}
            </article>
          );
        })}

      {!listLoading && !jobsError && !error && withdrawnCount > 0 && (
        <button
          type="button"
          onClick={() => setShowWithdrawn((v) => !v)}
          aria-pressed={showWithdrawn}
          className="w-full py-3 text-center text-sm font-medium text-muted underline"
        >
          {showWithdrawn ? "취소한 지원 숨기기" : `취소한 지원 보기 (${withdrawnCount})`}
        </button>
      )}

      <Dialog open={selecting !== null} onOpenChange={(v) => !busy && !v && setSelecting(null)}>
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
