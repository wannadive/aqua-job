import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultActiveRole, normalizeRoles, resolveActiveRole, routeFor } from "./logic.ts";
import type { Account } from "./types.ts";

const a = (o: Partial<Account>): Account => {
  const role = o.role ?? "instructor";
  return { id: "u", role, roles: [role], displayName: "x", accountStatus: "active", onboardingDone: true, ...o };
};

test("routeFor (역할 하나)", () => {
  assert.equal(routeFor(null, false), "intro");
  assert.equal(routeFor(null, true), "login");
  assert.equal(routeFor(a({ accountStatus: "banned" }), true), "blocked");
  assert.equal(routeFor(a({ accountStatus: "suspended", role: "center" }), true), "blocked");
  assert.equal(routeFor(a({ onboardingDone: false }), true), "instructor-onboarding");
  assert.equal(routeFor(a({ role: "center", onboardingDone: false }), true), "center");
  assert.equal(routeFor(a({ role: "admin" }), true), "admin");
  assert.equal(routeFor(a({ role: "admin", accountStatus: "banned" }), true), "blocked");
  assert.equal(routeFor(a({}), true), "instructor");
});

test("routeFor (여러 역할)", () => {
  const owner = a({ role: "admin", roles: ["admin", "instructor", "center"], onboardingDone: false });
  // 저장된 선택이 없으면 관리자부터
  assert.equal(routeFor(owner, true), "admin");
  assert.equal(routeFor(owner, true, null), "admin");
  // 강사로 바꾸면, 이력서를 아직 안 만들었으니 이력서 마법사
  assert.equal(routeFor(owner, true, "instructor"), "instructor-onboarding");
  assert.equal(routeFor({ ...owner, onboardingDone: true }, true, "instructor"), "instructor");
  assert.equal(routeFor(owner, true, "center"), "center");
  // 가지지 않은 역할·이상한 값은 기본으로
  assert.equal(routeFor(a({ roles: ["instructor", "center"] }), true, "admin"), "instructor");
  assert.equal(routeFor(owner, true, "hacker"), "admin");
  // 정지·퇴출이 먼저
  assert.equal(routeFor({ ...owner, accountStatus: "suspended" }, true, "center"), "blocked");
  // 강사로 가입해 센터 역할을 받은 계정은 가입 역할부터
  assert.equal(routeFor(a({ role: "instructor", roles: ["instructor", "center"] }), true), "instructor");
});

test("defaultActiveRole / resolveActiveRole", () => {
  assert.equal(defaultActiveRole(a({ role: "instructor", roles: ["instructor", "admin"] })), "admin");
  assert.equal(defaultActiveRole(a({ role: "center", roles: ["instructor", "center"] })), "center");
  const owner = a({ role: "admin", roles: ["admin", "instructor", "center"] });
  assert.equal(resolveActiveRole(owner, "center"), "center");
  assert.equal(resolveActiveRole(owner, ""), "admin");
  assert.equal(resolveActiveRole(a({ role: "center" }), "instructor"), "center");
});

test("normalizeRoles", () => {
  assert.deepEqual(normalizeRoles(undefined, "center"), ["center"]);
  assert.deepEqual(normalizeRoles([], "instructor"), ["instructor"]);
  // 순서는 관리자 → 강사 → 센터, 중복·모르는 값은 버리고, 대표 역할은 꼭 넣는다
  assert.deepEqual(normalizeRoles(["center", "admin", "admin", "x"], "instructor"), ["admin", "instructor", "center"]);
  assert.deepEqual(normalizeRoles("admin", "center"), ["center"]);
});
