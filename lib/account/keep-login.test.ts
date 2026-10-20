import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthStorageKey, parseKeepLogin, serializeKeepLogin } from "./keep-login.ts";

test("parseKeepLogin: 기본은 켜짐, '0'만 끔", () => {
  assert.equal(parseKeepLogin(null), true);
  assert.equal(parseKeepLogin(undefined), true);
  assert.equal(parseKeepLogin(""), true);
  assert.equal(parseKeepLogin("1"), true);
  assert.equal(parseKeepLogin("garbage"), true);
  assert.equal(parseKeepLogin("0"), false);
});

test("serializeKeepLogin 왕복", () => {
  assert.equal(serializeKeepLogin(true), "1");
  assert.equal(serializeKeepLogin(false), "0");
  assert.equal(parseKeepLogin(serializeKeepLogin(false)), false);
  assert.equal(parseKeepLogin(serializeKeepLogin(true)), true);
});

test("isAuthStorageKey", () => {
  assert.equal(isAuthStorageKey("sb-abcdef-auth-token"), true);
  assert.equal(isAuthStorageKey("sb-abcdef-auth-token-code-verifier"), true);
  assert.equal(isAuthStorageKey("aqua.keepLogin"), false);
  assert.equal(isAuthStorageKey("aqua.activeRole"), false);
});
