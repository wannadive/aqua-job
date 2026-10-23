import { test } from "node:test";
import assert from "node:assert/strict";
import { countUnread, isNotificationKind, safeInternalLink, urlBase64ToUint8Array } from "./logic.ts";
import { notificationFromRow } from "./mappers.ts";

test("urlBase64ToUint8Array: base64url(패딩 없음)을 바이트로 바꾼다", () => {
  // "hello?" → base64 "aGVsbG8/" → base64url "aGVsbG8_"
  assert.deepEqual([...urlBase64ToUint8Array("aGVsbG8_")], [...Buffer.from("hello?")]);
  // 패딩이 필요한 길이: "ab" → "YWI" (패딩 1개 생략)
  assert.deepEqual([...urlBase64ToUint8Array("YWI")], [0x61, 0x62]);
  // '-' 는 '+'(62)
  assert.deepEqual([...urlBase64ToUint8Array("-w")], [0xfb]);
});

test("urlBase64ToUint8Array: VAPID 공개 키 길이(65바이트, 0x04로 시작)", () => {
  const raw = Buffer.alloc(65, 7);
  raw[0] = 4;
  const b64url = raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const out = urlBase64ToUint8Array(b64url);
  assert.equal(out.length, 65);
  assert.equal(out[0], 4);
  assert.deepEqual([...out], [...raw]);
});

test("safeInternalLink: 앱 안 주소만 통과, 나머지는 '/'", () => {
  assert.equal(safeInternalLink("/?tab=offers&offer=abc"), "/?tab=offers&offer=abc");
  assert.equal(safeInternalLink("/"), "/");
  for (const bad of [
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/a b",
    "/a\nb",
    "",
    "/" + "x".repeat(300),
    null,
    undefined,
  ]) {
    assert.equal(safeInternalLink(bad as string | null | undefined), "/", String(bad));
  }
});

test("notificationFromRow: 행을 앱 타입으로, 알 수 없는 종류는 null, 앱 밖 링크는 '/'", () => {
  const row = {
    id: "n1",
    user_id: "u1",
    kind: "offer_new",
    title: "알림센터1에서 제안이 왔어요",
    body: "공고",
    link: "/?tab=offers&offer=o1",
    created_at: "2026-10-23T00:00:00Z",
    read_at: null,
  };
  assert.deepEqual(notificationFromRow(row), {
    id: "n1",
    kind: "offer_new",
    title: "알림센터1에서 제안이 왔어요",
    body: "공고",
    link: "/?tab=offers&offer=o1",
    createdAt: "2026-10-23T00:00:00Z",
    readAt: null,
  });
  assert.equal(notificationFromRow({ ...row, kind: "marketing" }), null);
  assert.equal(notificationFromRow({ ...row, link: "https://evil.example" })?.link, "/");
  assert.equal(notificationFromRow({ ...row, link: null })?.link, null);
});

test("isNotificationKind · countUnread", () => {
  assert.equal(isNotificationKind("doc_expiring"), true);
  assert.equal(isNotificationKind("chat"), false);
  assert.equal(countUnread([{ readAt: null }, { readAt: "2026-10-23T00:00:00Z" }, { readAt: null }]), 2);
});
