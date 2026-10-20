import { test } from "node:test";
import assert from "node:assert/strict";
import { routeFor } from "./logic.ts";
import type { Account } from "./types.ts";

test("routeFor", () => {
  const a = (o: Partial<Account>): Account => ({ id: "u", role: "instructor", displayName: "x", accountStatus: "active", onboardingDone: true, ...o });
  assert.equal(routeFor(null, false), "intro");
  assert.equal(routeFor(null, true), "login");
  assert.equal(routeFor(a({ accountStatus: "banned" }), true), "blocked");
  assert.equal(routeFor(a({ accountStatus: "suspended", role: "center" }), true), "blocked");
  assert.equal(routeFor(a({ onboardingDone: false }), true), "instructor-onboarding");
  assert.equal(routeFor(a({ role: "center", onboardingDone: false }), true), "center");
  assert.equal(routeFor(a({ role: "admin" }), true), "admin");
});
