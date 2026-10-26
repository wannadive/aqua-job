import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readSwOpenLink, SW_ACK, SW_LINK_MAX, SW_OPEN_LINK } from "./sw-message.ts";

const O = "https://aqua.test";
const J = "11111111-2222-4333-8444-555555555555";
const msg = (link: unknown) => ({ type: SW_OPEN_LINK, link });

test("같은 출처의 알림 링크 메시지는 연다", () => {
  const r = readSwOpenLink(msg(`/?tab=applicants&job=${J}`), O, O);
  assert.equal(r.kind, "open");
  if (r.kind === "open") {
    assert.equal(r.link, `/?tab=applicants&job=${J}`);
    assert.deepEqual(r.target, { kind: "applicants", jobId: J, appId: null });
  }
  assert.equal(readSwOpenLink(msg("/"), O, O).kind, "open");
});

test("다른 출처·빈 출처는 무시", () => {
  assert.equal(readSwOpenLink(msg("/"), "https://evil.test", O).kind, "ignore");
  assert.equal(readSwOpenLink(msg("/"), "", O).kind, "ignore");
  assert.equal(readSwOpenLink(msg("/"), "null", O).kind, "ignore");
});

test("우리 메시지 모양이 아니면 무시", () => {
  for (const d of [null, undefined, "x", 1, [], [SW_OPEN_LINK, "/"], { type: "other", link: "/" }, { link: "/" }]) {
    assert.equal(readSwOpenLink(d, O, O).kind, "ignore", JSON.stringify(d));
  }
  // 프로토타입에서 온 type은 인정하지 않음
  const proto = Object.create({ type: SW_OPEN_LINK });
  proto.link = "/";
  assert.equal(readSwOpenLink(proto, O, O).kind, "ignore");
});

test("앱 밖 주소·이상한 링크·남는 키는 열지 않음(invalid)", () => {
  const bad = [
    "https://evil.test/",
    "//evil.test/",
    "/\\evil.test",
    "javascript:alert(1)",
    "/jobs",
    "/?tab=unknown",
    `/?tab=offers&offer=not-uuid`,
    `/?tab=offers&offer=${J}#x`,
    `/?tab=offers&offer=${J}&offer=${J}`,
    "",
    "/?tab=documents&" + "a".repeat(SW_LINK_MAX),
    42,
    null,
  ];
  for (const l of bad) assert.equal(readSwOpenLink(msg(l), O, O).kind, "invalid", String(l));
  assert.equal(readSwOpenLink({ type: SW_OPEN_LINK, link: "/", extra: 1 }, O, O).kind, "invalid");
  assert.equal(readSwOpenLink({ type: SW_OPEN_LINK }, O, O).kind, "invalid");
});

test("public/sw.js와 같은 메시지 이름을 쓴다", () => {
  const sw = readFileSync(resolve(import.meta.dirname, "../../public/sw.js"), "utf8");
  assert.ok(sw.includes(`"${SW_OPEN_LINK}"`), "sw.js에 SW_OPEN_LINK 값이 있어야 함");
  assert.ok(sw.includes(`"${SW_ACK}"`), "sw.js에 SW_ACK 값이 있어야 함");
  assert.ok(sw.includes("safeTarget"), "sw.js는 같은 출처 검사(safeTarget)를 유지");
});
