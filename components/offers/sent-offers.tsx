"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { formatMdKst } from "@/lib/jobs/logic";
import type { JobSummary } from "@/lib/jobs/types";
import { withdrawOffer } from "@/lib/offers/api";
import { OFFER_STATUS_CENTER } from "@/lib/offers/logic";
import { useLeaveGuard } from "@/lib/navigation/use-navigable";
import type { Offer, OfferStatus } from "@/lib/offers/types";

const TONE = { ok: "bg-ok-bg text-ok", muted: "bg-surface text-muted", ink: "bg-surface text-ink" } as const;

const FILTERS: { key: OfferStatus | null; label: string }[] = [
  { key: null, label: "전체" },
  { key: "offered", label: "답 대기" },
  { key: "accepted", label: "수락" },
  { key: "declined", label: "거절" },
  { key: "withdrawn", label: "철회" },
  { key: "expired", label: "마감" },
];

/** 센터 [보낸 제안]: 상태별 목록 + 답 대기 제안 철회. 연락처는 여기서 다루지 않는다(지원자 탭의 연락처 카드에서만). */
export function SentOffers({
  offers,
  jobs,
  loading,
  error,
  onRetry,
  onResume,
  onApplicants,
  onChanged,
}: {
  offers: Offer[];
  jobs: JobSummary[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onResume: (o: Offer) => void;
  /** 수락한 제안 → 지원자 탭(그 공고)에서 연락처 */
  onApplicants: (jobId: string) => void;
  onChanged: () => Promise<unknown> | void;
}) {
  const [filter, setFilter] = useState<OfferStatus | null>(null);
  const [withdrawing, setWithdrawing] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  // 처리하는 중에는 확인 창을 닫는 폰 뒤로가기를 조용히 되돌린다(창과 기록 칸이 어긋나지 않게, 15초 상한) — 시트와 같은 장치
  const guard = useLeaveGuard(false, { busy: busy && withdrawing !== null });
  const busyRef = useRef(false);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const visible = filter ? offers.filter((o) => o.status === filter) : offers;

  const doWithdraw = async () => {
    const target = withdrawing;
    if (!target || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await withdrawOffer(target.id);
      setWithdrawing(null);
      if (res.error) toast.error(res.error);
      else toast.success("제안을 철회했어요");
      await onChanged();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${filter === f.key ? "bg-ink text-white" : "bg-white text-ink shadow-sm"}`}
          >
            {f.label} {f.key ? offers.filter((o) => o.status === f.key).length : offers.length}
          </button>
        ))}
      </div>

      {loading && <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>}
      {!loading && error && (
        <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
          보낸 제안을 불러오지 못했어요
          <button type="button" onClick={onRetry} className="font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">{offers.length === 0 ? "아직 보낸 제안이 없어요" : "이 상태의 제안이 없어요"}</p>
      )}

      {!loading &&
        !error &&
        visible.map((o) => {
          const st = OFFER_STATUS_CENTER[o.status];
          const job = jobById.get(o.jobId);
          return (
            <article key={o.id} className="rounded-card bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-ink">{o.instructorName ?? "강사"}</h3>
                  <p className="truncate text-sm text-muted">{job?.title ?? "공고"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[st.tone]}`}>{st.label}</span>
              </div>
              {o.message && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-surface p-3 text-sm text-ink">{o.message}</p>}
              <p className="mt-2 text-xs text-muted">
                {formatMdKst(o.createdAt)} 보냄{o.respondedAt ? ` · ${formatMdKst(o.respondedAt)} ${st.label}` : ""}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className={`h-11 border-line text-base ${o.status === "offered" || o.status === "accepted" ? "" : "col-span-2"}`}
                  onClick={() => onResume(o)}
                >
                  이력서 보기
                </Button>
                {o.status === "offered" && (
                  <Button variant="outline" className="h-11 border-line text-base text-muted" disabled={busy} onClick={() => setWithdrawing(o)}>
                    철회
                  </Button>
                )}
                {o.status === "accepted" && (
                  <Button className="h-11 bg-ink text-base text-white" onClick={() => onApplicants(o.jobId)}>
                    연락처 보기
                  </Button>
                )}
              </div>
            </article>
          );
        })}

      <Dialog open={withdrawing !== null} onOpenChange={(v) => !v && !guard.isSending() && setWithdrawing(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>제안을 철회할까요?</DialogTitle>
          <DialogDescription>철회하면 강사가 답할 수 없고, 이 공고로 같은 강사에게 다시 제안할 수 없어요</DialogDescription>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 border-line" disabled={busy} onClick={() => setWithdrawing(null)}>
              돌아가기
            </Button>
            <Button className="h-11 bg-ink text-white" disabled={busy} onClick={() => void doWithdraw()}>
              {busy ? "철회하는 중…" : "철회하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
