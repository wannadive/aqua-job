"use client";

import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/notifications/format";
import { useNotifications } from "./notifications-provider";
import { PushSettingsCard } from "./push-settings-card";

/**
 * 알림 목록(화면 전체를 덮는 층). 최신순, 안 읽은 것은 강조, 누르면 읽음 → 해당 화면.
 * 알림 글은 텍스트로만 그린다(HTML로 해석하지 않음).
 */
export function NotificationPanel() {
  const n = useNotifications();
  const { panelOpen, closePanel } = n;

  // Esc로 닫기(데스크톱)
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  if (!n.panelOpen) return null;

  const hasUnread = (n.unread ?? 0) > 0 || !!n.items?.some((x) => x.readAt == null);
  const now = new Date();

  return (
    <div role="dialog" aria-modal="true" aria-label="알림" className="fixed inset-0 z-30 overflow-y-auto bg-bg">
      <div className="mx-auto w-full max-w-md px-5 pb-16 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={n.closePanel}
            className="-ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-base font-semibold text-ink"
          >
            <ChevronLeft className="size-5" /> 닫기
          </button>
          <Button
            variant="outline"
            className="h-11 border-line text-sm"
            disabled={!hasUnread || n.markingAll || n.listLoading}
            onClick={() => void n.markAll()}
          >
            {n.markingAll ? "처리 중…" : "모두 읽음"}
          </Button>
        </div>
        <h1 className="mt-3 text-[26px] font-bold tracking-tight text-ink">알림</h1>

        <div className="mt-4 space-y-3">
          {n.listError && (
            <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
              알림을 불러오지 못했어요
              <button type="button" onClick={() => void n.reloadList()} className="font-semibold text-ink underline">
                다시 시도
              </button>
            </div>
          )}
          {!n.listError && n.items === null && <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>}
          {!n.listError && n.items !== null && n.items.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">아직 받은 알림이 없어요</p>
          )}

          {n.items && n.items.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-sm">
              {n.items.map((item) => {
                const unread = item.readAt == null;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void n.openItem(item)}
                      className={`flex w-full items-start gap-3 px-5 py-4 text-left ${unread ? "" : "opacity-70"}`}
                    >
                      <span
                        aria-hidden
                        className={`mt-2 size-2 shrink-0 rounded-full ${unread ? "bg-accent" : "bg-transparent"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block break-words text-base text-ink ${unread ? "font-bold" : "font-medium"}`}>
                          {item.title}
                        </span>
                        {item.body && <span className="mt-0.5 block break-words text-sm text-muted">{item.body}</span>}
                        <span className="mt-1 block text-xs text-muted">
                          {relativeTime(item.createdAt, now)}
                          {unread && <span className="sr-only"> · 안 읽음</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {n.items && n.items.length > 0 && n.hasMore && (
            <Button variant="outline" className="h-11 w-full border-line" disabled={n.listLoading} onClick={() => void n.loadMore()}>
              {n.listLoading ? "불러오는 중…" : "더 보기"}
            </Button>
          )}
          {n.items && n.items.length > 0 && !n.hasMore && n.items.length >= 200 && (
            <p className="text-center text-xs text-muted">최근 알림 200개까지 보여요</p>
          )}
        </div>

        <div className="mt-6">
          <PushSettingsCard />
        </div>
      </div>
    </div>
  );
}
