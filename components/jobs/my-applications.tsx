"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FOCUS_MISSING_TEXT, focusRing, useFocusItem, type FocusRequest } from "@/components/shared/use-focus-item";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { withdrawApplication } from "@/lib/jobs/api";
import { applicationGroup, formatMdKst, type ApplicationGroup } from "@/lib/jobs/logic";
import type { MyApplication } from "@/lib/jobs/types";
import type { ReceivedOffer } from "@/lib/offers/types";
import { JobCard } from "./job-card";

const GROUPS: { key: ApplicationGroup; label: string; empty: string }[] = [
  { key: "applied", label: "지원함", empty: "결과를 기다리는 지원이 없어요" },
  { key: "selected", label: "선택·수락", empty: "아직 선택된 지원이나 수락한 제안이 없어요" },
  { key: "closed", label: "마감·미선택", empty: "마감되었거나 선택되지 않은 지원이 없어요" },
  { key: "withdrawn", label: "취소함", empty: "취소한 지원이 없어요" },
];

const CHIP: Record<string, { label: string; cls: string }> = {
  applied: { label: "지원함", cls: "bg-surface text-ink" },
  selected: { label: "선택됨", cls: "bg-ok-bg text-ok" },
  not_selected: { label: "선택되지 않음", cls: "bg-surface text-muted" },
  withdrawn: { label: "취소함", cls: "bg-surface text-muted" },
};

export function MyApplications({
  apps,
  loading,
  error,
  onRetry,
  onOpenJob,
  onChanged,
  acceptedOffers = [],
  focusJob = null,
}: {
  apps: MyApplication[];
  /** 알림에서 온 공고(id = 공고 id) — 그 지원이 있는 묶음을 열고 강조 */
  focusJob?: FocusRequest | null;
  /** 수락한 제안(009) — 선택·수락 묶음에 "제안 수락"으로 함께 보인다 */
  acceptedOffers?: ReceivedOffer[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpenJob: (jobId: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [group, setGroup] = useState<ApplicationGroup>("applied");
  const [cancelling, setCancelling] = useState<MyApplication | null>(null);
  const [busy, setBusy] = useState(false);

  const highlight = useFocusItem(
    focusJob,
    !loading && !error,
    (jobId) => {
      const app = apps.find((a) => a.jobId === jobId && a.status !== "withdrawn") ?? apps.find((a) => a.jobId === jobId);
      if (app) {
        setGroup(applicationGroup(app));
        return true;
      }
      if (acceptedOffers.some((o) => o.jobId === jobId && o.status === "accepted")) {
        setGroup("selected");
        return true;
      }
      return false;
    },
    FOCUS_MISSING_TEXT,
  );

  const grouped = apps.filter((a) => applicationGroup(a) === group);
  const offersHere = group === "selected" ? acceptedOffers.filter((o) => o.status === "accepted") : [];
  const groupCount = (k: ApplicationGroup) =>
    apps.filter((a) => applicationGroup(a) === k).length + (k === "selected" ? acceptedOffers.filter((o) => o.status === "accepted").length : 0);
  const meta = GROUPS.find((g) => g.key === group)!;

  const doCancel = async () => {
    if (!cancelling || busy) return;
    setBusy(true);
    const res = await withdrawApplication(cancelling.id);
    try {
      if (res.error) {
        // 이미 선택·취소 등으로 바뀌었을 수 있다: 창을 닫고 현황을 다시 불러온다
        toast.error(res.error);
        setCancelling(null);
        await onChanged();
        return;
      }
      toast.success("지원을 취소했어요");
      setCancelling(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">지원 현황</h1>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroup(g.key)}
            aria-pressed={group === g.key}
            className={`min-h-11 rounded-lg text-sm font-semibold ${group === g.key ? "bg-white text-ink shadow-sm" : "text-muted"}`}
          >
            {g.label} {groupCount(g.key)}
          </button>
        ))}
      </div>

      {loading && <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>}
      {!loading && error && (
        <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
          지원 현황을 불러오지 못했어요
          <button type="button" onClick={onRetry} className="font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      )}
      {!loading && !error && grouped.length === 0 && offersHere.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">{meta.empty}</p>
      )}

      {!loading &&
        !error &&
        offersHere.map((o) => {
          const chipEl = (
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">제안 수락</span>
              <span className="text-xs font-normal text-muted">{formatMdKst(o.respondedAt ?? o.createdAt)} 수락</span>
            </span>
          );
          const note = (
            <p className="rounded-xl bg-ok-bg p-3 text-sm font-semibold text-ok">
              {o.job?.centerName ?? "센터"}의 제안을 수락했어요. 이 센터에 내 연락처가 열렸어요
            </p>
          );
          return (
            <div key={`o:${o.id}`} data-focus-id={o.jobId} className={focusRing(highlight === o.jobId)}>
              {!o.job ? (
                <article className="rounded-card bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold">{chipEl}</div>
                  <p className="mt-2 text-sm text-muted">내려간 공고예요</p>
                </article>
              ) : (
                <JobCard job={o.job} onOpen={() => onOpenJob(o.jobId)} extra={chipEl}>
                  {note}
                </JobCard>
              )}
            </div>
          );
        })}

      {grouped.map((a) => {
        const chip = CHIP[a.status];
        const chipEl = (
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${chip.cls}`}>{chip.label}</span>
            <span className="text-xs font-normal text-muted">{formatMdKst(a.createdAt)} 지원</span>
          </span>
        );
        const actions = (
          <>
            {a.status === "selected" && (
              <p className="rounded-xl bg-ok-bg p-3 text-sm font-semibold text-ok">
                {a.job?.centerName ?? "센터"}에서 선택했어요. 곧 연락이 갈 거예요
              </p>
            )}
            {a.status === "applied" && (
              <Button
                variant="outline"
                className="mt-2 h-11 w-full border-line text-base text-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  setCancelling(a);
                }}
              >
                지원 취소
              </Button>
            )}
          </>
        );
        const hasActions = a.status === "selected" || a.status === "applied";
        return (
          <div key={a.id} data-focus-id={a.jobId} className={focusRing(highlight === a.jobId)}>
            {!a.job ? (
              <article className="rounded-card bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold">{chipEl}</div>
                <p className="mt-2 text-sm text-muted">내려간 공고예요</p>
                {hasActions && <div className="mt-3">{actions}</div>}
              </article>
            ) : (
              <JobCard
                job={a.job}
                dimmed={a.job.status !== "open" && a.status !== "selected"}
                onOpen={() => onOpenJob(a.jobId)}
                extra={chipEl}
              >
                {hasActions ? actions : undefined}
              </JobCard>
            )}
          </div>
        );
      })}

      <Dialog open={cancelling !== null} onOpenChange={(v) => !busy && !v && setCancelling(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>지원을 취소할까요?</DialogTitle>
          <DialogDescription>취소하면 센터의 지원자 목록에서 빠져요. 공고가 진행중이면 다시 지원할 수 있어요.</DialogDescription>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 border-line" disabled={busy} onClick={() => setCancelling(null)}>
              돌아가기
            </Button>
            <Button className="h-11 bg-ink text-white" disabled={busy} onClick={() => void doCancel()}>
              지원 취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
