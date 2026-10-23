"use client";

import { Bell } from "lucide-react";
import { bellLabel, formatBadge } from "@/lib/notifications/format";
import { useNotifications } from "./notifications-provider";

/** 상단 종 + 안 읽은 개수(10개부터 9+). 누르면 알림 목록. */
export function NotificationBell() {
  const { unread, openPanel } = useNotifications();
  const badge = formatBadge(unread);
  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label={bellLabel(unread)}
      className="relative flex size-11 items-center justify-center rounded-full bg-white text-ink shadow-sm"
    >
      <Bell className="size-5" />
      {badge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-warn px-1 text-[11px] font-bold leading-none text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

/** 역할 화면 위 종 막대(셸이 화면 위에 둔다) */
export function NotificationBar() {
  return (
    <div className="mx-auto flex w-full max-w-md justify-end px-5 pt-3">
      <NotificationBell />
    </div>
  );
}
