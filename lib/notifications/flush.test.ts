import { test } from "node:test";
import assert from "node:assert/strict";
import { BRAND } from "../brand.ts";
import { buildPushPayload, isGoneStatus, isValidVapidSubject, secretMatches } from "./flush.ts";

test("secretMatches: 같은 값만 true, 비었거나 다르면 false", () => {
  assert.equal(secretMatches("s3cret-value", "s3cret-value"), true);
  assert.equal(secretMatches("s3cret-valuX", "s3cret-value"), false);
  assert.equal(secretMatches("s3cret", "s3cret-value"), false);
  assert.equal(secretMatches("", "s3cret-value"), false);
  assert.equal(secretMatches(null, "s3cret-value"), false);
  // 설정이 비어 있으면 무엇을 보내도 false
  assert.equal(secretMatches("", ""), false);
  assert.equal(secretMatches("x", undefined), false);
});

test("buildPushPayload: 제목·본문·링크만, 길이 제한, 앱 밖 링크는 '/'", () => {
  const p = buildPushPayload({
    title: "알림센터1에서 선택했어요",
    body: "공고",
    link: "/?tab=applications&job=j1",
    // 다른 칸이 있어도 싣지 않는다
    ...({ endpoint: "https://fcm.googleapis.com/x", p256dh: "k", auth: "a" } as object),
  });
  assert.deepEqual(p, { title: "알림센터1에서 선택했어요", body: "공고", link: "/?tab=applications&job=j1" });
  assert.deepEqual(Object.keys(p).sort(), ["body", "link", "title"]);
  assert.equal(buildPushPayload({ title: "t", body: "b", link: "//evil.example" }).link, "/");
  assert.equal(buildPushPayload({ title: "", body: null, link: null }).title, BRAND.name);
  assert.equal(buildPushPayload({ title: "x".repeat(200), body: "y".repeat(500), link: "/" }).title.length, 80);
  assert.equal(buildPushPayload({ title: "x", body: "y".repeat(500), link: "/" }).body.length, 300);
});

test("isGoneStatus: 404·410만 구독 삭제", () => {
  assert.equal(isGoneStatus(404), true);
  assert.equal(isGoneStatus(410), true);
  assert.equal(isGoneStatus(429), false);
  assert.equal(isGoneStatus(500), false);
  assert.equal(isGoneStatus(undefined), false);
});

test("isValidVapidSubject: mailto: 또는 https:", () => {
  assert.equal(isValidVapidSubject("mailto:admin@example.com"), true);
  assert.equal(isValidVapidSubject("https://aquajob.example"), true);
  assert.equal(isValidVapidSubject("admin@example.com"), false);
  assert.equal(isValidVapidSubject("http://aquajob.example"), false);
  assert.equal(isValidVapidSubject(""), false);
  assert.equal(isValidVapidSubject(undefined), false);
});
