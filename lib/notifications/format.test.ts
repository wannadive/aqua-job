import { test } from "node:test";
import assert from "node:assert/strict";
import { bellLabel, canLoadMore, formatBadge, nextListLimit, relativeTime, shouldRefresh } from "./format.ts";

test("formatBadge: 없음·0은 null, 1~9 그대로, 10부터 9+", () => {
  assert.equal(formatBadge(null), null);
  assert.equal(formatBadge(undefined), null);
  assert.equal(formatBadge(0), null);
  assert.equal(formatBadge(-3), null);
  assert.equal(formatBadge(Number.NaN), null);
  assert.equal(formatBadge(1), "1");
  assert.equal(formatBadge(9), "9");
  assert.equal(formatBadge(10), "9+");
  assert.equal(formatBadge(1234), "9+");
  assert.equal(bellLabel(0), "알림");
  assert.equal(bellLabel(12), "알림, 안 읽은 알림 9+개");
});

test("relativeTime: 방금·분·시간·어제·일·날짜(KST)", () => {
  const now = new Date("2026-10-23T12:00:00Z"); // KST 21:00
  assert.equal(relativeTime("2026-10-23T11:59:40Z", now), "방금");
  assert.equal(relativeTime("2026-10-23T12:05:00Z", now), "방금"); // 기기 시계가 늦음
  assert.equal(relativeTime("2026-10-23T11:55:00Z", now), "5분 전");
  assert.equal(relativeTime("2026-10-23T09:00:00Z", now), "3시간 전");
  assert.equal(relativeTime("2026-10-22T11:00:00Z", now), "어제");
  assert.equal(relativeTime("2026-10-19T12:00:00Z", now), "4일 전");
  assert.equal(relativeTime("2026-10-01T16:00:00Z", now), "10/2"); // KST로 10/2 01:00
  assert.equal(relativeTime("2025-12-31T16:00:00Z", now), "1/1"); // KST 2026-01-01
  assert.equal(relativeTime("2025-12-31T14:00:00Z", now), "2025.12.31");
  assert.equal(relativeTime("not a date", now), "");
  assert.equal(relativeTime(null, now), "");
});

test("shouldRefresh: 겹친 이벤트는 간격 안이면 건너뛴다", () => {
  assert.equal(shouldRefresh(null, 1000), true);
  assert.equal(shouldRefresh(1000, 3000, 5000), false);
  assert.equal(shouldRefresh(1000, 6000, 5000), true);
  assert.equal(shouldRefresh(1000, 1001, 5000, true), true);
});

test("목록 더 보기: 50개씩, 최대 200", () => {
  assert.equal(nextListLimit(50), 100);
  assert.equal(nextListLimit(180), 200);
  assert.equal(nextListLimit(200), 200);
  assert.equal(canLoadMore(50, 50), true);
  assert.equal(canLoadMore(12, 50), false);
  assert.equal(canLoadMore(200, 200), false);
});
