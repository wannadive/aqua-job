"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { JobCard } from "@/components/jobs/job-card";
import { Button } from "@/components/ui/button";
import { FOCUS_MISSING_TEXT, focusRing, useFocusItem, type FocusRequest } from "@/components/shared/use-focus-item";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { formatMdKst } from "@/lib/jobs/logic";
import { respondOffer } from "@/lib/offers/api";
import { ACCEPT_CONFIRM, OFFER_STATUS_INSTRUCTOR, canAccept, canDecline, receivedGroup, type ReceivedGroup } from "@/lib/offers/logic";
import { useLeaveGuard } from "@/lib/navigation/use-navigable";
import type { ReceivedOffer } from "@/lib/offers/types";

const GROUPS: { key: ReceivedGroup; label: string; empty: string }[] = [
  { key: "pending", label: "답 대기", empty: "답을 기다리는 제안이 없어요" },
  { key: "accepted", label: "수락함", empty: "수락한 제안이 없어요" },
  { key: "past", label: "지난 제안", empty: "거절·철회·마감된 제안이 없어요" },
];

const TONE = { ok: "bg-ok-bg text-ok", muted: "bg-surface text-muted", ink: "bg-surface text-ink" } as const;

/**
 * 강사 [제안] 탭: 받은 제안 → 수락(확인 창)/거절(가벼운 확인).
 * 버튼은 안내용이고 최종 판단은 respond_offer(서버). 서버가 거부하면(이미 답함·철회·마감·인원 참) 알리고 다시 불러온다.
 */
export function ReceivedOffers({
  offers,
  loading,
  error,
  onRetry,
  onOpenJob,
  onChanged,
  focus = null,
}: {
  offers: ReceivedOffer[];
  /** 알림에서 온 제안 — 그 묶음을 열고 강조 */
  focus?: FocusRequest | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpenJob: (jobId: string) => void;
  /** 답한 뒤(성공·실패 모두) 받은 제안 다시 불러오기 */
  onChanged: () => Promise<void> | void;
}) {
  const [group, setGroup] = useState<ReceivedGroup>("pending");
  const [confirm, setConfirm] = useState<{ offer: ReceivedOffer; accept: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // 처리하는 중에는 확인 창을 닫는 폰 뒤로가기를 조용히 되돌린다(창과 기록 칸이 어긋나지 않게, 15초 상한) — 시트와 같은 장치
  const guard = useLeaveGuard(false, { busy: busy && confirm !== null });
  const busyRef = useRef(false);

  const highlight = useFocusItem(
    focus,
    !loading && !error,
    (id) => {
      const o = offers.find((x) => x.id === id);
      if (!o) return false;
      setGroup(receivedGroup(o));
      return true;
    },
    FOCUS_MISSING_TEXT,
  );

  const grouped = offers.filter((o) => receivedGroup(o) === group);
  const meta = GROUPS.find((g) => g.key === group)!;

  const doRespond = async () => {
    const target = confirm; // 누른 순간의 대상(닫힌 뒤 바뀐 state를 보지 않게)
    if (!target || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await respondOffer(target.offer.id, target.accept);
      setConfirm(null);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(target.accept ? "제안을 수락했어요. 이 센터에 내 연락처가 열렸어요" : "제안을 거절했어요");
        if (target.accept) setGroup("accepted");
      }
      await onChanged();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">받은 제안</h1>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroup(g.key)}
            aria-pressed={group === g.key}
            className={`min-h-11 rounded-lg text-sm font-semibold ${group === g.key ? "bg-white text-ink shadow-sm" : "text-muted"}`}
          >
            {g.label} {offers.filter((o) => receivedGroup(o) === g.key).length}
          </button>
        ))}
      </div>

      {loading && <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>}
      {!loading && error && (
        <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
          받은 제안을 불러오지 못했어요
          <button type="button" onClick={onRetry} className="font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      )}
      {!loading && !error && grouped.length === 0 && <p className="py-10 text-center text-sm text-muted">{meta.empty}</p>}

      {!loading &&
        !error &&
        grouped.map((o) => {
          const st = OFFER_STATUS_INSTRUCTOR[o.status];
          const chip = (
            <span className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[st.tone]}`}>{st.label}</span>
              <span className="text-xs font-normal text-muted">{formatMdKst(o.createdAt)} 받음</span>
            </span>
          );
          const acceptable = canAccept(o);
          const declinable = canDecline(o);
          const body = (
            <div className="space-y-2">
              {o.message && (
                <div className="rounded-xl bg-surface p-3">
                  <div className="text-xs font-semibold text-muted">센터 한마디</div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{o.message}</p>
                </div>
              )}
              {o.status === "accepted" && (
                <p className="rounded-xl bg-ok-bg p-3 text-sm font-semibold text-ok">
                  수락했어요. {o.job?.centerName ?? "센터"}에 내 연락처가 열렸어요
                </p>
              )}
              {o.status === "offered" && !acceptable && (
                <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn">모집이 끝난 공고라 수락할 수 없어요</p>
              )}
              {(acceptable || declinable) && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className={`h-11 border-line text-base text-muted ${acceptable ? "" : "col-span-2"}`}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirm({ offer: o, accept: false });
                    }}
                  >
                    거절
                  </Button>
                  {acceptable && (
                    <Button
                      className="h-11 bg-ink text-base text-white"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirm({ offer: o, accept: true });
                      }}
                    >
                      수락
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
          const card = !o.job ? (
            <article className="rounded-card bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold">{chip}</div>
              <p className="mt-2 text-sm text-muted">내려간 공고예요</p>
              <div className="mt-3">{body}</div>
            </article>
          ) : (
            <JobCard
              job={o.job}
              showStatus
              dimmed={o.status !== "offered" && o.status !== "accepted"}
              onOpen={() => onOpenJob(o.jobId)}
              extra={chip}
            >
              {body}
            </JobCard>
          );
          return (
            <div key={o.id} data-focus-id={o.id} className={focusRing(highlight === o.id)}>
              {card}
            </div>
          );
        })}

      <Dialog open={confirm !== null} onOpenChange={(v) => !v && !guard.isSending() && setConfirm(null)}>
        <DialogContent className="max-w-sm">
          {confirm?.accept ? (
            <>
              <DialogTitle>제안을 수락할까요?</DialogTitle>
              <DialogDescription>{ACCEPT_CONFIRM}</DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>제안을 거절할까요?</DialogTitle>
              <DialogDescription>센터에는 정중히 거절했다고만 보여요</DialogDescription>
            </>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 border-line" disabled={busy} onClick={() => setConfirm(null)}>
              돌아가기
            </Button>
            <Button className="h-11 bg-ink text-white" disabled={busy} onClick={() => void doRespond()}>
              {busy ? "보내는 중…" : confirm?.accept ? "수락하기" : "거절하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
