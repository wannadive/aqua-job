"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchPendingPurges, fetchReviewQueue, purgeOriginal, type PendingPurge, type ReviewItem } from "@/lib/verification/admin-api";
import { DOC_TYPES } from "@/lib/verification/config";
import { kstDate, ROLE_LABEL } from "@/lib/verification/admin-logic";
import { ReviewDetail } from "./review-detail";

/**
 * 확인은 끝났는데 원본(신분증) 사진 삭제가 실패해 남아 있는 서류.
 * 목록을 불러올 때마다 한 번씩 자동으로 다시 지워 보고, 그래도 남은 건은 직접 다시 시도할 수 있게 보여 준다.
 */
function PendingPurges({ attempt }: { attempt: number }) {
  const [rows, setRows] = useState<PendingPurge[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await fetchPendingPurges();
        if (first.length === 0) {
          if (!cancelled) setRows([]);
          return;
        }
        for (const r of first) {
          if (cancelled) return;
          await purgeOriginal(r.id);
        }
        const left = await fetchPendingPurges();
        if (!cancelled) setRows(left);
      } catch {
        // 이 목록을 못 불러와도 확인 대기열은 그대로 쓸 수 있다. 다음 불러오기 때 다시 시도한다.
        if (!cancelled) toast.error("원본 삭제 대기 목록을 불러오지 못했어요");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await purgeOriginal(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("원본 사진을 삭제했어요");
      setRows((l) => l.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) return null;
  return (
    <section className="rounded-card bg-warn-bg p-5">
      <h2 className="text-base font-bold text-warn">원본 삭제 대기 {rows.length}건</h2>
      <p className="mt-1 text-sm text-warn">확인은 끝났지만 신분증 원본 사진이 아직 남아 있어요.</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{r.ownerName}</div>
              <div className="text-xs text-muted">
                {DOC_TYPES[r.docType].label}
                {r.verifiedAt ? ` · 확인 ${kstDate(r.verifiedAt)}` : ""}
              </div>
            </div>
            <Button variant="outline" className="h-10 shrink-0" disabled={busyId !== null} onClick={() => void retry(r.id)}>
              다시 삭제
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReviewQueue() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<ReviewItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    fetchReviewQueue()
      .then((l) => !cancelled && setItems(l))
      .catch(() => {
        if (!cancelled) {
          toast.error("확인할 서류를 불러오지 못했어요");
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = () => setAttempt((n) => n + 1);

  if (selected) {
    return (
      <ReviewDetail
        item={selected}
        onBack={() => {
          setSelected(null);
          reload();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">서류 확인</h1>
        <p className="mt-1 text-sm text-muted">{items ? `확인 대기 ${items.length}건 · 오래된 순` : "확인 대기 서류"}</p>
      </div>

      <PendingPurges attempt={attempt} />

      {loadError ? (
        <div className="rounded-card bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-muted">확인할 서류를 불러오지 못했어요</p>
          <Button variant="outline" className="mt-3 h-12" onClick={reload}>
            다시 시도
          </Button>
        </div>
      ) : !items ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <div className="rounded-card bg-white p-6 text-center text-sm text-muted shadow-sm">확인을 기다리는 서류가 없어요</div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => setSelected(it)}
                className="flex w-full items-center gap-3 rounded-card bg-white p-5 text-left shadow-sm active:bg-surface"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base font-bold text-ink">{it.ownerName}</span>
                    <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted">
                      {ROLE_LABEL[it.ownerRole]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-ink">{DOC_TYPES[it.docType].label}</div>
                  <div className="mt-0.5 text-xs text-muted">제출일 {kstDate(it.submittedAt)}</div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
