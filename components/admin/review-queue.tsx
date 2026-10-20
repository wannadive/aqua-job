"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchReviewQueue, type ReviewItem } from "@/lib/verification/admin-api";
import { DOC_TYPES } from "@/lib/verification/config";
import { kstDate, ROLE_LABEL } from "@/lib/verification/admin-logic";
import { ReviewDetail } from "./review-detail";

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
