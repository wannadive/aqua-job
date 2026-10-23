import type { NOTIFICATION_KINDS } from "./config.ts";

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * 앱 안 알림 1건. 쓰기는 DB 트리거만(aqua_notify), 화면은 읽기·읽음 표시만 한다.
 * link는 앱 안 주소('/'로 시작). 010 트리거가 만드는 주소:
 *   /?tab=applicants&job=<공고>[&app=<지원>]  센터 — 새 지원자(app 포함), 제안 수락·거절
 *   /?tab=applications&job=<공고> 강사 — 선택됨, 마감(미선택)
 *   /?tab=offers&offer=<제안>     강사 — 제안 도착, 제안 마감
 *   /?tab=documents               서류 확인·반려·만료 임박
 *   /?tab=jobs&job=<공고>         센터 — 공고 숨김
 *   /                             계정 정지·퇴출
 */
export type AquaNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
};

/** 웹 푸시 1건에 싣는 내용 — 제목·본문·링크만 */
export type PushPayload = {
  title: string;
  body: string;
  link: string;
};
