// 알림 종류 — DB aqua_notifications_kind_check(010~012)와 같아야 한다(config.test.ts가 비교).
export const NOTIFICATION_KINDS = [
  "application_new",
  "application_selected",
  "application_closed",
  "offer_new",
  "offer_accepted",
  "offer_declined",
  "offer_expired",
  "doc_verified",
  "doc_rejected",
  "doc_expiring",
  "job_hidden",
  "account_suspended",
  "account_banned",
  // 012: 공고 다시 보임 · 계정 다시 활성
  "job_unhidden",
  "account_reactivated",
] as const;

/** DB 트리거(pg_net)가 /api/push/flush를 부를 때 싣는 비밀값 헤더 이름. 값은 PUSH_FLUSH_SECRET. */
export const PUSH_FLUSH_SECRET_HEADER = "x-aqua-push-secret";

/** 알림 목록 한 번에 가져오는 최대 개수 */
export const NOTIFICATION_PAGE_SIZE = 50;
