import { parseNotificationLink, type NotificationTarget } from "./link.ts";

/**
 * 서비스 워커 ↔ 열린 앱 창 메시지(푸시를 누름 → 새로 고침 대신 앱 안에서 이동). 순수 함수(테스트: sw-message.test.ts).
 * public/sw.js가 보내는 모양: { type: SW_OPEN_LINK, link: '/?tab=…' } + 답장 포트 하나.
 * 앱은 받으면 답장 포트로 { type: SW_ACK }를 보내고(서비스 워커는 답이 없으면 예전처럼 창 주소를 바꾼다),
 * 링크는 알림 종과 같은 해석기(parseNotificationLink)·같은 이동 처리(작성 중 확인 포함)로 연다.
 * 같은 값을 public/sw.js에도 적는다(서비스 워커는 모듈을 import하지 않는다).
 */
export const SW_OPEN_LINK = "aqua:open-link";
export const SW_ACK = "aqua:ack";
/** 링크 길이 상한(알림 링크는 짧다 — 이상하게 긴 값은 버림) */
export const SW_LINK_MAX = 300;

export type SwOpenLink =
  /** 우리 메시지가 아님(무시, 답장 안 함) */
  | { kind: "ignore" }
  /** 우리 메시지지만 열 수 없는 주소(답장하고 안내) */
  | { kind: "invalid" }
  | { kind: "open"; link: string; target: NotificationTarget };

/**
 * 메시지 출처와 내용 검사. 같은 출처(서비스 워커는 앱과 같은 출처)이고, 정확히 {type, link} 두 키,
 * link는 알림 링크 해석기를 통과해야 한다.
 */
export function readSwOpenLink(data: unknown, origin: string, expectedOrigin: string): SwOpenLink {
  // 서비스 워커 메시지의 origin은 앱 출처 — 다르면(빈 값 포함) 우리 것이 아님
  if (origin !== expectedOrigin) return { kind: "ignore" };
  if (data === null || typeof data !== "object" || Array.isArray(data)) return { kind: "ignore" };
  if (Object.getPrototypeOf(data) !== Object.prototype) return { kind: "ignore" };
  const rec = data as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(rec, "type") || rec.type !== SW_OPEN_LINK) return { kind: "ignore" };
  const keys = Object.keys(rec);
  if (keys.length !== 2 || !keys.includes("link")) return { kind: "invalid" };
  const link = rec.link;
  if (typeof link !== "string" || link.length === 0 || link.length > SW_LINK_MAX) return { kind: "invalid" };
  const target = parseNotificationLink(link);
  if (!target) return { kind: "invalid" };
  return { kind: "open", link, target };
}
