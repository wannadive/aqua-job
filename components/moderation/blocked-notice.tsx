"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchMyBlockedReason } from "@/lib/moderation/api";
import { BLOCKED_TITLE, blockedNotificationKind } from "@/lib/moderation/logic";

/**
 * 정지·퇴출 계정 화면. 사유는 내 최근 계정 알림(본인만 보인다) 본문에서 읽는다 — 새 서버 API 없음.
 * 사유가 없거나 못 읽으면 중립 문구만. 로그아웃은 부르는 쪽(셸)이 푸시 정리 로그아웃을 넘긴다.
 */
export function BlockedNotice({
  status,
  userId,
  onLogout,
}: {
  status: "suspended" | "banned";
  /** 계정이 바뀌면 다시 읽는다 */
  userId: string;
  onLogout: () => Promise<void> | void;
}) {
  const [reason, setReason] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const loggingOut = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setReason(undefined);
    const kind = blockedNotificationKind(status);
    if (!kind) {
      setReason(null);
      return;
    }
    fetchMyBlockedReason(userId, kind)
      .then((r) => !cancelled && setReason(r))
      .catch(() => !cancelled && setReason(null));
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  const logout = async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    setBusy(true);
    try {
      await onLogout();
    } finally {
      // 로그아웃에 실패하면(셸이 안내) 다시 누를 수 있게
      loggingOut.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-card bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-ink">{BLOCKED_TITLE[status]}</h1>
        {reason === undefined ? (
          <p className="mt-3 text-sm text-muted">불러오는 중…</p>
        ) : reason ? (
          <div className="mt-3 rounded-xl bg-warn-bg p-4">
            <p className="text-xs font-semibold text-warn">운영팀이 알린 사유</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-ink">{reason}</p>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-muted">문의가 필요하면 운영팀에 연락해 주세요.</p>
        <Button className="mt-6 h-12 w-full" disabled={busy} onClick={() => void logout()}>
          {busy ? "로그아웃하는 중…" : "로그아웃"}
        </Button>
      </div>
    </main>
  );
}
