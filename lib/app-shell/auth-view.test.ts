import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAuthView, serializeAuthView } from "./auth-view.ts";

test("auth view 저장 값: 왕복 · 모르는 값·깨진 값은 null", () => {
  assert.deepEqual(parseAuthView(serializeAuthView({ view: "signup", role: "center" })), { view: "signup", role: "center" });
  assert.deepEqual(parseAuthView(serializeAuthView({ view: "login", role: "instructor" })), { view: "login", role: "instructor" });
  assert.equal(parseAuthView(null), null);
  assert.equal(parseAuthView(""), null);
  assert.equal(parseAuthView("{"), null);
  assert.equal(parseAuthView(JSON.stringify({ view: "admin", role: "instructor" })), null);
  assert.equal(parseAuthView(JSON.stringify({ view: "login", role: "admin" })), null);
  assert.equal(parseAuthView("null"), null);
});
