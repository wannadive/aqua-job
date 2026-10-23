"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { FOCUS_MISSING_TEXT, focusRing, useFocusItem, type FocusRequest } from "@/components/shared/use-focus-item";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { closeJob } from "@/lib/jobs/api";
import { filledCount } from "@/lib/offers/logic";
import type { JobSummary } from "@/lib/jobs/types";
import { JobCard } from "./job-card";
import type { ApplicantCounts } from "./use-my-jobs";

export function MyJobs({
  jobs,
  counts,
  loading,
  error,
  onRetry,
  onNew,
  onEdit,
  onApplicants,
  onChanged,
  focusJob = null,
}: {
  /** 알림에서 온 공고(숨김 알림 등) — 그 묶음(진행중/마감)을 열고 강조 */
  focusJob?: FocusRequest | null;
  jobs: JobSummary[];
  counts: ApplicantCounts;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onNew: () => void;
  onEdit: (job: JobSummary) => void;
  onApplicants: (job: JobSummary) => void;
  onChanged: () => Promise<unknown> | void;
}) {
  const [view, setView] = useState<"open" | "closed">("open");
  const [closing, setClosing] = useState<JobSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const highlight = useFocusItem(
    focusJob,
    !loading && !error,
    (id) => {
      const j = jobs.find((x) => x.id === id);
      if (!j) return false;
      setView(j.status === "open" ? "open" : "closed");
      return true;
    },
    FOCUS_MISSING_TEXT,
  );

  const list = jobs.filter((j) => (view === "open" ? j.status === "open" : j.status !== "open"));

  const doClose = async () => {
    if (!closing || busy) return;
    setBusy(true);
    const res = await closeJob(closing.id);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("공고를 마감했어요");
    setClosing(null);
    await onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-bold tracking-tight text-ink">공고</h1>
        <Button className="h-11 bg-ink px-4 text-base text-white" onClick={onNew}>
          <Plus className="size-4" /> 공고 올리기
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
        {(["open", "closed"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            aria-pressed={view === k}
            className={`min-h-11 rounded-lg text-sm font-semibold ${view === k ? "bg-white text-ink shadow-sm" : "text-muted"}`}
          >
            {k === "open" ? "진행중" : "마감"} {jobs.filter((j) => (k === "open") === (j.status === "open")).length}
          </button>
        ))}
      </div>

      {loading && <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>}
      {!loading && error && (
        <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
          공고를 불러오지 못했어요
          <button type="button" onClick={onRetry} className="font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      )}
      {!loading && !error && list.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">
          {view === "open" ? "진행중인 공고가 없어요" : "마감된 공고가 없어요"}
        </p>
      )}

      {list.map((job) => {
        const c = counts.get(job.id) ?? { applied: 0, selected: 0, total: 0 };
        return (
          <div key={job.id} data-focus-id={job.id} className={focusRing(highlight === job.id)}>
          <JobCard job={job} showStatus extra={`${c.total}명 지원 · 선택·수락 ${filledCount(job)}/${job.headcount}`}>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11 border-line text-base" onClick={() => onApplicants(job)}>
                지원자 보기{c.applied > 0 ? ` (${c.applied})` : ""}
              </Button>
              {job.status === "open" && (
                <>
                  <Button variant="outline" className="h-11 border-line text-base" onClick={() => onEdit(job)}>
                    수정
                  </Button>
                  <Button variant="outline" className="col-span-2 h-11 border-line text-base text-muted" onClick={() => setClosing(job)}>
                    마감하기
                  </Button>
                </>
              )}
            </div>
          </JobCard>
          </div>
        );
      })}

      <Dialog open={closing !== null} onOpenChange={(v) => !busy && !v && setClosing(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>공고를 마감할까요?</DialogTitle>
          <DialogDescription>마감하면 새 지원을 받을 수 없어요. 이미 받은 지원자는 그대로 볼 수 있어요.</DialogDescription>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 border-line" disabled={busy} onClick={() => setClosing(null)}>
              취소
            </Button>
            <Button className="h-11 bg-ink text-white" disabled={busy} onClick={() => void doClose()}>
              마감하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
