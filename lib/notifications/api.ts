import { createClient } from "@/lib/supabase/client";
import { NOTIFICATION_PAGE_SIZE } from "./config";
import { notificationFromRow } from "./mappers";
import type { AquaNotification } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// 앱 안 알림·푸시 구독 API (브라우저). 쓰기는 RPC만 — 알림 만들기는 DB 트리거가 한다.

/** 내 알림(최신순, 최대 limit개). 오류는 던진다. */
export async function listNotifications(limit: number = NOTIFICATION_PAGE_SIZE): Promise<AquaNotification[]> {
  const { data, error } = await createClient()
    .from("aqua_notifications")
    .select("id, kind, title, body, link, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(1, limit), 200));
  if (error) throw new Error("알림을 불러오지 못했어요");
  return (data ?? []).map(notificationFromRow).filter((n): n is AquaNotification => n !== null);
}

/** 안 읽은 알림 개수. 오류는 던진다. */
export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await (createClient() as any).rpc("aqua_unread_count");
  if (error) throw new Error("알림 개수를 불러오지 못했어요");
  return typeof data === "number" ? data : 0;
}

/** 고른 알림 읽음 표시(내 것만 바뀐다) */
export async function markRead(ids: string[]): Promise<{ error?: string }> {
  if (ids.length === 0) return {};
  const { error } = await (createClient() as any).rpc("aqua_mark_read", { p_ids: ids.slice(0, 500) });
  return error ? { error: "읽음 표시를 하지 못했어요" } : {};
}

/** 모두 읽음 */
export async function markAllRead(): Promise<{ error?: string }> {
  const { error } = await (createClient() as any).rpc("aqua_mark_all_read");
  return error ? { error: "읽음 표시를 하지 못했어요" } : {};
}

/** 이 기기의 푸시 구독 저장(활성 회원, 알려진 푸시 서비스 주소만 — DB가 확인) */
export async function savePushSubscription(sub: PushSubscription): Promise<{ error?: string }> {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { error: "알림 정보를 읽지 못했어요" };
  const { error } = await (createClient() as any).rpc("aqua_save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
  });
  return error ? { error: "알림을 켜지 못했어요" } : {};
}

/** 이 기기의 푸시 구독 지우기(내 것만 지워진다 — RLS) */
export async function removePushSubscription(endpoint: string): Promise<{ error?: string }> {
  const { error } = await (createClient().from("aqua_push_subscriptions") as any).delete().eq("endpoint", endpoint);
  return error ? { error: "알림을 끄지 못했어요" } : {};
}

/**
 * 이 기기 구독 주소가 서버에 내 행으로 있는지(RLS: 내 행만 보인다).
 * 오류는 던진다(모를 때 브라우저 구독을 함부로 지우지 않게).
 */
export async function isMyPushSubscription(endpoint: string): Promise<boolean> {
  const { data, error } = await (createClient().from("aqua_push_subscriptions") as any)
    .select("id")
    .eq("endpoint", endpoint)
    .limit(1);
  if (error) throw new Error("알림 상태를 확인하지 못했어요");
  return Array.isArray(data) && data.length > 0;
}
