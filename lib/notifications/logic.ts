import { NOTIFICATION_KINDS } from "./config.ts";
import type { AquaNotification, NotificationKind } from "./types.ts";

/**
 * VAPID 공개 키(base64url) → PushManager.subscribe의 applicationServerKey(Uint8Array).
 * 워너다이브 lib/push/client.ts의 urlBase64ToUint8Array와 같은 변환.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * 앱 안 주소만 통과시킨다(아니면 "/"). DB 제약(aqua_notifications_link_check)과 같은 규칙:
 * '/'로 시작, 두 번째 글자가 '/'·'\'가 아님, 공백·제어문자 없음, 300자까지.
 */
export function safeInternalLink(link: string | null | undefined): string {
  if (typeof link !== "string" || link.length === 0 || link.length > 300) return "/";
  if (link[0] !== "/") return "/";
  if (link[1] === "/" || link[1] === "\\") return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(link)) return "/";
  return link;
}

export function isNotificationKind(v: unknown): v is NotificationKind {
  return typeof v === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(v);
}

/** 안 읽은 개수 */
export function countUnread(items: Pick<AquaNotification, "readAt">[]): number {
  return items.filter((n) => n.readAt == null).length;
}
