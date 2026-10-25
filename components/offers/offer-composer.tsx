"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { listApplicantsForJobs } from "@/lib/jobs/api";
import { formatJobDates, formatPay } from "@/lib/jobs/logic";
import type { JobApplication, JobSummary } from "@/lib/jobs/types";
import { sendOffer } from "@/lib/offers/api";
import { OFFER_JOB_BLOCK_LABEL, OFFER_MESSAGE_MAX, offerJobBlock, offerLimit, offersSentFor } from "@/lib/offers/logic";
import type { Offer } from "@/lib/offers/types";
import { isDirty } from "@/lib/navigation/dirty";
import { useLeaveGuard } from "@/lib/navigation/use-navigable";

/**
 * [공고 골라서 제안하기] 시트. 내 모집 중 공고 중 하나 + 한마디(200자, 선택) → send_offer.
 * 고를 수 없는 공고(이미 제안·이미 지원·한도·모집 끝)는 이유와 함께 흐리게 — 안내용이고 최종 판단은 서버.
 * 서버가 거부하면 알리고 공고·제안을 다시 불러온 뒤 시트는 열어 둔다(다른 공고를 고를 수 있게).
 */
export function OfferComposer({
  instructor,
  jobs,
  offers,
  offersUnavailable = false,
  onRetryOffers,
  onClose,
  onSent,
  onRefresh,
  onNewJob,
}: {
  /** null이면 닫힘 */
  instructor: { id: string; name: string } | null;
  /** 내 공고(전부 — 여기서 모집 중만 고른다) */
  jobs: JobSummary[];
  /** 내가 보낸 제안 전부(한도·중복 안내용) */
  offers: Offer[];
  /** 내 공고·보낸 제안을 아직 못 읽었거나 실패 — 보내기를 막고 안내 */
  offersUnavailable?: boolean;
  onRetryOffers?: () => void;
  onClose: () => void;
  /** 보낸 뒤: 보낸 제안 다시 불러오기 */
  onSent: () => Promise<unknown> | void;
  /** 거부된 뒤: 공고·제안 다시 불러오기 */
  onRefresh: () => Promise<unknown> | void;
  onNewJob: () => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [apps, setApps] = useState<JobApplication[]>([]);
  const instructorId = instructor?.id ?? null;
  const openJobs = jobs.filter((j) => j.status === "open");
  const openKey = openJobs.map((j) => j.id).join(",");
  // 작성 중 = 공고를 골랐거나 한마디를 적음. 폰 뒤로가기·취소·바깥 누름 전에 묻는다
  // 보내는 중에는 묻지 않고, 시트를 닫는 폰 뒤로가기는 조용히 되돌린다(busy)
  const guard = useLeaveGuard(instructorId !== null && isDirty({ jobId: null, message: "" }, { jobId, message }), { busy });
  const close = () => {
    if (busyRef.current || guard.isSending() || !guard.confirmLeave()) return;
    onClose();
  };

  // 열 때마다 새로 시작. 이미 지원한 강사 안내용으로 모집 중 공고의 지원을 읽는다(실패해도 서버가 다시 막는다).
  useEffect(() => {
    setJobId(null);
    setMessage("");
    setApps([]);
  }, [instructorId]);
  useEffect(() => {
    if (!instructorId) return;
    let cancelled = false;
    listApplicantsForJobs(openKey ? openKey.split(",") : [])
      .then((list) => !cancelled && setApps(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [instructorId, openKey]);

  const blockOf = (j: JobSummary) => (instructorId ? offerJobBlock(j, instructorId, offers, apps) : "not_open");

  // 다시 불러온 뒤 고른 공고가 막혔거나 사라졌으면 선택을 푼다
  const chosen = openJobs.find((j) => j.id === jobId) ?? null;
  const chosenOk = chosen !== null && blockOf(chosen) === null;
  useEffect(() => {
    if (jobId && !chosenOk) setJobId(null);
  }, [jobId, chosenOk]);

  const submit = async () => {
    const target = instructorId;
    const job = jobId;
    if (!target || !job || busyRef.current || offersUnavailable) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await sendOffer(job, target, message);
      if (res.error) {
        toast.error(res.error);
        await onRefresh();
        return;
      }
      toast.success("제안을 보냈어요. 강사가 답하면 보낸 제안에서 확인할 수 있어요");
      guard.release(); // 보냈으니 닫을 때 묻지 않는다
      try {
        await onSent();
      } finally {
        onClose();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open={instructor !== null} onOpenChange={(v) => !v && close()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left text-lg font-bold text-ink">{instructor?.name ?? "강사"}님에게 제안하기</SheetTitle>
          <SheetDescription className="text-left text-sm text-muted">제안할 공고를 하나 골라 주세요</SheetDescription>
        </SheetHeader>

        {instructor && (
          <div className="mt-4 space-y-4">
            {openJobs.length === 0 ? (
              <div className="rounded-xl bg-surface p-4 text-sm text-ink">
                <p>모집 중인 공고가 없어요. 공고를 먼저 올려야 제안할 수 있어요.</p>
                <Button className="mt-3 h-11 w-full bg-ink text-base text-white" onClick={onNewJob}>
                  공고 올리기
                </Button>
              </div>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="제안할 공고">
                {openJobs.map((j) => {
                  const block = blockOf(j);
                  const on = jobId === j.id;
                  const dates = formatJobDates(j);
                  return (
                    <button
                      key={j.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={block !== null || busy}
                      onClick={() => setJobId(j.id)}
                      className={`w-full rounded-xl border p-4 text-left ${
                        on ? "border-ink bg-white" : "border-line bg-white"
                      } ${block ? "opacity-50" : ""}`}
                    >
                      <p className="text-base font-bold text-ink">{j.title}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        {j.region}
                        {dates ? ` · ${dates}` : ""} · {formatPay(j.payAmount, j.payUnit)}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        보낸 제안 {offersSentFor(offers, j.id)}/{offerLimit(j.headcount)}
                        {block ? ` · ${OFFER_JOB_BLOCK_LABEL[block]}` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {openJobs.length > 0 && (
              <div>
                <label htmlFor="offer-message" className="text-sm font-semibold text-ink">
                  한마디 <span className="font-normal text-muted">(선택)</span>
                </label>
                <Textarea
                  id="offer-message"
                  value={message}
                  maxLength={OFFER_MESSAGE_MAX}
                  disabled={busy}
                  onChange={(e) => setMessage(e.target.value.slice(0, OFFER_MESSAGE_MAX))}
                  placeholder="강사에게 전하고 싶은 말이 있다면 적어 주세요"
                  className="mt-2 text-base"
                />
                <div className="mt-1 flex items-start justify-between gap-3 text-xs text-muted">
                  <p>연락처는 적지 말아 주세요. 강사가 수락하면 연락처가 자동으로 열려요.</p>
                  <p className="shrink-0">
                    {message.length}/{OFFER_MESSAGE_MAX}
                  </p>
                </div>
              </div>
            )}

            {offersUnavailable && (
              <div className="rounded-xl bg-warn-bg p-4 text-sm text-warn">
                보낸 제안을 불러오지 못해 지금은 제안할 수 없어요
                {onRetryOffers && (
                  <button type="button" onClick={onRetryOffers} className="ml-3 font-semibold underline">
                    다시 시도
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-[52px] border-line text-base" disabled={busy} onClick={close}>
                취소
              </Button>
              <Button
                className="h-[52px] bg-ink text-base text-white"
                disabled={busy || !chosenOk || offersUnavailable}
                onClick={() => void submit()}
              >
                {busy ? "보내는 중…" : "제안 보내기"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
