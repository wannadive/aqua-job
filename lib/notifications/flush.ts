// /api/push/flush 서버 쪽 순수 로직(브라우저에서 import하지 않는다 — node:crypto 사용).
import { createHash, timingSafeEqual } from "node:crypto";
import { BRAND } from "../brand.ts";
import { safeInternalLink } from "./logic.ts";
import type { PushPayload } from "./types.ts";

/**
 * 비밀값 비교(상수 시간). 길이가 달라도 시간이 새지 않게 양쪽을 SHA-256으로 같은 길이로 만든 뒤 비교한다.
 * 기대값이 비어 있으면(설정 안 됨) 항상 false.
 */
export function secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected) return false;
  const a = createHash("sha256").update(provided ?? "", "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b) && (provided ?? "").length === expected.length;
}

/** 대기열 행 → 푸시에 싣는 내용(제목·본문·링크만, 길이 제한, 링크는 앱 안 주소만) */
export function buildPushPayload(row: { title?: unknown; body?: unknown; link?: unknown }): PushPayload {
  const title = typeof row.title === "string" && row.title.trim() ? row.title.slice(0, 80) : BRAND.name;
  const body = typeof row.body === "string" ? row.body.slice(0, 300) : "";
  return { title, body, link: safeInternalLink(typeof row.link === "string" ? row.link : "/") };
}

/** 푸시 서비스가 "이 기기 구독은 끝났다"고 답한 상태(구독 행을 지운다) */
export function isGoneStatus(code: unknown): boolean {
  return code === 404 || code === 410;
}

/** VAPID subject는 mailto: 또는 https: 주소여야 한다 */
export function isValidVapidSubject(subject: string | null | undefined): boolean {
  return typeof subject === "string" && /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject);
}
