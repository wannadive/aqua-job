import { isNotificationKind, safeInternalLink } from "./logic.ts";
import type { AquaNotification } from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** aqua_notifications 행 → 앱 타입. 알 수 없는 종류는 null(목록에서 뺀다). */
export function notificationFromRow(row: any): AquaNotification | null {
  if (!row || typeof row.id !== "string" || !isNotificationKind(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind,
    title: typeof row.title === "string" ? row.title : "",
    body: typeof row.body === "string" ? row.body : "",
    link: row.link == null ? null : safeInternalLink(row.link),
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
  };
}
