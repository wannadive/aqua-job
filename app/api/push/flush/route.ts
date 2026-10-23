import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUSH_FLUSH_SECRET_HEADER } from "@/lib/notifications/config";
import type { ClaimedPushRow } from "@/lib/supabase/database.types";
import { buildPushPayload, isGoneStatus, isValidVapidSubject, secretMatches } from "@/lib/notifications/flush";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const BATCH = 100;
const MAX_ROUNDS = 5;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * 웹 푸시 발송 — aqua_push_outbox(받는 기기마다 한 행)에 쌓인 것을 꺼내 web-push(VAPID)로 보낸다.
 * 호출: DB 트리거(pg_net, 대기열 INSERT 때)가 헤더 x-aqua-push-secret(= PUSH_FLUSH_SECRET)를 실어 POST.
 * 비밀값이 맞을 때만 service role로 aqua_claim_push_outbox를 부른다(가져가면서 보냄 표시 → 동시 호출 중복 없음).
 * 끝난 구독(404/410)은 지우고, 보내기 성공한 기기는 last_used_at을 갱신한다.
 * 응답·로그에 구독 주소·키·비밀값을 남기지 않는다(상태 코드와 개수만).
 */
export async function POST(req: Request) {
  const secret = process.env.PUSH_FLUSH_SECRET;
  if (!secret) {
    console.error("[push-flush] PUSH_FLUSH_SECRET not configured");
    return json(500, { error: "not_configured" });
  }
  if (!secretMatches(req.headers.get(PUSH_FLUSH_SECRET_HEADER), secret)) {
    return json(401, { error: "unauthorized" });
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublic || !vapidPrivate || !isValidVapidSubject(vapidSubject)
      || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // 어떤 값이 빠졌는지 이름만 남긴다(값은 남기지 않는다)
    const missing = [
      !vapidPublic && "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      !vapidPrivate && "VAPID_PRIVATE_KEY",
      !isValidVapidSubject(vapidSubject) && "VAPID_SUBJECT",
      !process.env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
      !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    ].filter(Boolean);
    console.error("[push-flush] not configured:", missing.join(", "));
    return json(500, { error: "not_configured" });
  }

  try {
    webpush.setVapidDetails(vapidSubject as string, vapidPublic, vapidPrivate);
  } catch {
    console.error("[push-flush] invalid VAPID keys");
    return json(500, { error: "not_configured" });
  }

  const db = createAdminClient();
  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await (db as any).rpc("aqua_claim_push_outbox", { p_limit: BATCH });
    if (error) {
      console.error("[push-flush] claim failed");
      return json(500, { error: "server_error" });
    }
    const rows = (data ?? []) as ClaimedPushRow[];
    if (rows.length === 0) break;

    const gone = new Set<string>();
    const ok = new Set<string>();
    await Promise.all(
      rows.map(async (r) => {
        try {
          await webpush.sendNotification(
            { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
            JSON.stringify(buildPushPayload(r)),
            { TTL: 60 * 60 * 24, urgency: "high" }
          );
          sent++;
          ok.add(r.subscription_id);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (isGoneStatus(code)) gone.add(r.subscription_id);
          else failed++;
        }
      })
    );

    if (gone.size) {
      await (db.from("aqua_push_subscriptions") as any).delete().in("id", Array.from(gone));
      removed += gone.size;
    }
    const alive = Array.from(ok).filter((id) => !gone.has(id));
    if (alive.length) {
      await (db.from("aqua_push_subscriptions") as any)
        .update({ last_used_at: new Date().toISOString() })
        .in("id", alive);
    }
    if (rows.length < BATCH) break;
  }

  if (failed) console.warn(`[push-flush] ${failed} send(s) failed`);
  return json(200, { status: "ok", sent, removed, failed });
}
