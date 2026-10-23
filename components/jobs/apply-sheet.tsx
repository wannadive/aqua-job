"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { applyToJob } from "@/lib/jobs/api";
import { formatJobDates, formatPay } from "@/lib/jobs/logic";
import type { JobSummary } from "@/lib/jobs/types";
import { fetchMyInstructorProfile } from "@/lib/talent-profile/api";
import { resumeCompleteness } from "@/lib/talent-profile/logic";

export const APPLY_MESSAGE_MAX = 200;

/**
 * 지원 시트. 권한은 서버(apply_to_job)가 정한다 — 여기서는 안내만.
 * job이 null이면 닫힌 상태. 성공하면 onApplied 후 닫는다.
 */
export function ApplySheet({
  job,
  onClose,
  onApplied,
  onOpenResume,
}: {
  job: JobSummary | null;
  onClose: () => void;
  onApplied: () => void | Promise<void>;
  /** 내 이력서로 이동(주면 완성도 안내에 링크가 생긴다) */
  onOpenResume?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [resumeError, setResumeError] = useState(false);
  const jobId = job?.id ?? null;

  useEffect(() => {
    if (!jobId) return;
    setMessage("");
    setBusy(false);
    submitting.current = false;
    setMissing(null);
    setResumeError(false);
    let cancelled = false;
    fetchMyInstructorProfile()
      .then((p) => {
        if (cancelled) return;
        setMissing(p ? resumeCompleteness(p).missing : ["이력서"]);
      })
      .catch(() => !cancelled && setResumeError(true));
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const submit = async () => {
    if (!job || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    const res = await applyToJob(job.id, message);
    if (res.error) {
      // 이미 마감·지원됨 등으로 바뀌었을 수 있다: 상태를 다시 불러오고 시트를 닫는다
      toast.error(res.error);
      try {
        await onApplied();
      } finally {
        submitting.current = false;
        setBusy(false);
        onClose();
      }
      return;
    }
    toast.success("지원했어요");
    // 성공하면 닫힐 때까지 busy 유지(이중 제출 방지). 새로 불러오다 실패해도 시트는 닫는다.
    try {
      await onApplied();
    } finally {
      onClose();
    }
  };

  const dates = job ? formatJobDates(job) : "";

  return (
    <Sheet open={job !== null} onOpenChange={(v) => !v && !busy && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left text-lg font-bold text-ink">이 공고에 지원할까요?</SheetTitle>
          <SheetDescription className="sr-only">지원 내용을 확인하고 지원합니다</SheetDescription>
        </SheetHeader>
        {job && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-surface p-4">
              <p className="text-base font-bold text-ink">{job.title}</p>
              <p className="mt-0.5 text-sm text-muted">
                {job.centerName} · {job.region}
              </p>
              {dates && <p className="mt-2 text-sm font-medium text-ink">{dates}</p>}
              <p className="mt-1 text-sm font-semibold text-ink">{formatPay(job.payAmount, job.payUnit)}</p>
            </div>

            <div>
              <label htmlFor="apply-message" className="text-sm font-semibold text-ink">
                한마디 <span className="font-normal text-muted">(선택)</span>
              </label>
              <Textarea
                id="apply-message"
                value={message}
                maxLength={APPLY_MESSAGE_MAX}
                disabled={busy}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="센터에 전하고 싶은 말이 있다면 적어 주세요"
                className="mt-2 text-base"
              />
              <div className="mt-1 flex items-start justify-between gap-3 text-xs text-muted">
                <p>연락처는 적지 말아 주세요. 선택되면 센터에 자동으로 열려요.</p>
                <p className="shrink-0">
                  {message.length}/{APPLY_MESSAGE_MAX}
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-muted">
              내 이력서가 함께 전달돼요. 연락처는 센터가 선택했을 때만 그 센터에 열려요.
            </p>

            {missing && missing.length > 0 && (
              <div className="rounded-xl bg-warn-bg p-4 text-sm text-warn">
                <p className="font-semibold">이력서에 비어 있는 항목이 있어요</p>
                <p className="mt-1">{missing.join(", ")}</p>
                {onOpenResume && (
                  <button
                    type="button"
                    onClick={onOpenResume}
                    disabled={busy}
                    className="mt-2 flex h-11 items-center font-semibold underline"
                  >
                    내 이력서 채우러 가기
                  </button>
                )}
              </div>
            )}
            {resumeError && <p className="text-sm text-muted">이력서 상태를 불러오지 못했어요. 그래도 지원할 수 있어요.</p>}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-[52px] border-line text-base" disabled={busy} onClick={onClose}>
                취소
              </Button>
              <Button className="h-[52px] bg-ink text-base text-white" disabled={busy} onClick={() => void submit()}>
                {busy ? "지원하는 중…" : "지원하기"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
