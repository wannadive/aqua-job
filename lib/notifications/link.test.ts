import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNotificationLink, readLaunchTarget, resolveTarget, isUuid, type LinkRole } from "./link.ts";

const J = "11111111-2222-4333-8444-555555555555";
const O = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const A = "99999999-8888-4777-8666-555555555555";

test("parseNotificationLink: 010 트리거가 만드는 주소를 모두 읽는다", () => {
  assert.deepEqual(parseNotificationLink("/"), { kind: "home" });
  assert.deepEqual(parseNotificationLink(`/?tab=offers&offer=${O}`), { kind: "offers", offerId: O });
  assert.deepEqual(parseNotificationLink(`/?tab=applications&job=${J}`), { kind: "applications", jobId: J });
  assert.deepEqual(parseNotificationLink(`/?tab=applicants&job=${J}`), { kind: "applicants", jobId: J, appId: null });
  assert.deepEqual(parseNotificationLink(`/?tab=applicants&job=${J}&app=${A}`), { kind: "applicants", jobId: J, appId: A });
  assert.deepEqual(parseNotificationLink(`/?tab=jobs&job=${J}`), { kind: "jobs", jobId: J });
  assert.deepEqual(parseNotificationLink("/?tab=documents"), { kind: "documents" });
  // 키 순서는 상관없다, id 없는 탭도 된다
  assert.deepEqual(parseNotificationLink(`/?app=${A}&tab=applicants&job=${J}`), { kind: "applicants", jobId: J, appId: A });
  assert.deepEqual(parseNotificationLink("/?tab=offers"), { kind: "offers", offerId: null });
  // 대문자 UUID도 UUID
  assert.deepEqual(parseNotificationLink(`/?tab=jobs&job=${J.toUpperCase()}`), { kind: "jobs", jobId: J.toUpperCase() });
});

test("parseNotificationLink: 앱 밖 주소·이상한 주소는 null", () => {
  for (const bad of [
    null,
    undefined,
    "",
    "https://evil.example/?tab=offers",
    "//evil.example/?tab=offers",
    "/\\evil.example",
    "javascript:alert(1)",
    "?tab=offers",
    "/admin?tab=offers",
    "/jobs",
    `/x/?tab=jobs&job=${J}`,
    `/?tab=offers&offer=${O}#frag`,
    "/?tab=settings",
    "/?tab=admin",
    "/?tab=",
    "/?",
    "/?tab=offers&offer=abc",
    `/?tab=offers&offer=${O}x`,
    `/?tab=offers&offer=${O}&offer=${O}`,
    `/?tab=offers&tab=jobs&offer=${O}`,
    `/?tab=offers&job=${J}`,
    `/?tab=offers&offer=${O}&next=https://evil.example`,
    `/?tab=documents&job=${J}`,
    `/?tab=jobs&job=${J}&`,
    `/?tab=jobs&&job=${J}`,
    `/?tab=jobs&job`,
    `/?tab=jobs&=x`,
    `/?tab=jobs&job=%2F%2Fevil`,
    "/?tab=jobs&job=" + J.slice(0, 35),
    "/?tab=offers&offer=<script>",
    `/?tab=offers &offer=${O}`,
    "/" + "x".repeat(400),
  ]) {
    assert.equal(parseNotificationLink(bad as string | null | undefined), null, String(bad));
  }
});

test("readLaunchTarget: 첫 화면 주소의 알림 링크(푸시 누름)", () => {
  assert.deepEqual(readLaunchTarget(""), { present: false, target: null });
  assert.deepEqual(readLaunchTarget("?auth=login"), { present: false, target: null });
  assert.deepEqual(readLaunchTarget(`?tab=offers&offer=${O}`), { present: true, target: { kind: "offers", offerId: O } });
  assert.deepEqual(readLaunchTarget(`tab=documents`), { present: true, target: { kind: "documents" } });
  // tab이 있으면 이상한 값이어도 present(주소창은 정리한다)
  assert.deepEqual(readLaunchTarget("?tab=evil"), { present: true, target: null });
  assert.deepEqual(readLaunchTarget(`?tab=offers&offer=${O}&auth=login`), { present: true, target: null });
});

test("isUuid", () => {
  assert.equal(isUuid(J), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(null), false);
});

const both: LinkRole[] = ["instructor", "center"];

test("resolveTarget: 역할별 화면·탭", () => {
  assert.deepEqual(resolveTarget({ kind: "offers", offerId: O }, ["instructor"], "instructor", true), {
    kind: "go",
    intent: { role: "instructor", tab: "offers", jobId: null, offerId: O },
  });
  assert.deepEqual(resolveTarget({ kind: "applications", jobId: J }, ["instructor"], "instructor", true), {
    kind: "go",
    intent: { role: "instructor", tab: "applications", jobId: J, offerId: null },
  });
  assert.deepEqual(resolveTarget({ kind: "applicants", jobId: J, appId: A }, ["center"], "center", true), {
    kind: "go",
    intent: { role: "center", tab: "applicants", jobId: J, appId: A },
  });
  // 겸용 계정이 센터 화면을 보다가 제안 알림 → 강사 화면으로
  assert.deepEqual(resolveTarget({ kind: "offers", offerId: O }, both, "center", true), {
    kind: "go",
    intent: { role: "instructor", tab: "offers", jobId: null, offerId: O },
  });
  // 공고 숨김(jobs)은 센터가 먼저
  assert.deepEqual(resolveTarget({ kind: "jobs", jobId: J }, both, "instructor", true), {
    kind: "go",
    intent: { role: "center", tab: "jobs", jobId: J, appId: null },
  });
  assert.deepEqual(resolveTarget({ kind: "jobs", jobId: J }, ["instructor"], "instructor", true), {
    kind: "go",
    intent: { role: "instructor", tab: "jobs", jobId: J, offerId: null },
  });
});

test("resolveTarget: 서류·홈은 지금 역할 우선", () => {
  assert.deepEqual(resolveTarget({ kind: "documents" }, both, "center", true), {
    kind: "go",
    intent: { role: "center", tab: "settings", jobId: null, appId: null },
  });
  assert.deepEqual(resolveTarget({ kind: "documents" }, both, "instructor", true), {
    kind: "go",
    intent: { role: "instructor", tab: "resume", jobId: null, offerId: null },
  });
  // 관리자 화면에서 서류 알림 → 가진 역할(강사 먼저)
  assert.deepEqual(resolveTarget({ kind: "documents" }, ["admin", "center"], "admin", true), {
    kind: "go",
    intent: { role: "center", tab: "settings", jobId: null, appId: null },
  });
  assert.deepEqual(resolveTarget({ kind: "home" }, ["admin", "center"], "admin", true), { kind: "stay" });
  assert.deepEqual(resolveTarget({ kind: "home" }, ["center"], "center", true), {
    kind: "go",
    intent: { role: "center", tab: "home", jobId: null, appId: null },
  });
});

test("resolveTarget: 여러 역할 계정은 온보딩 전 강사보다 바로 쓸 수 있는 센터를 고른다", () => {
  assert.deepEqual(resolveTarget({ kind: "documents" }, both, "instructor", false), {
    kind: "go",
    intent: { role: "center", tab: "settings", jobId: null, appId: null },
  });
  assert.deepEqual(resolveTarget({ kind: "home" }, ["admin", "instructor", "center"], "admin", false), { kind: "stay" });
  assert.deepEqual(resolveTarget({ kind: "documents" }, ["admin", "instructor", "center"], "admin", false), {
    kind: "go",
    intent: { role: "center", tab: "settings", jobId: null, appId: null },
  });
  // 강사 역할만 있으면 온보딩 안내
  assert.deepEqual(resolveTarget({ kind: "documents" }, ["instructor"], "instructor", false), { kind: "needs-onboarding" });
  // 강사에게만 가는 알림은 센터가 있어도 온보딩 안내
  assert.deepEqual(resolveTarget({ kind: "offers", offerId: O }, both, "center", false), { kind: "needs-onboarding" });
});

test("resolveTarget: 역할이 없거나 온보딩 전이면 이동하지 않는다", () => {
  assert.deepEqual(resolveTarget({ kind: "offers", offerId: O }, ["center"], "center", true), { kind: "no-role" });
  assert.deepEqual(resolveTarget({ kind: "applications", jobId: J }, ["admin"], "admin", true), { kind: "no-role" });
  assert.deepEqual(resolveTarget({ kind: "applicants", jobId: J, appId: null }, ["instructor"], "instructor", true), {
    kind: "no-role",
  });
  assert.deepEqual(resolveTarget({ kind: "jobs", jobId: J }, ["admin"], "admin", true), { kind: "no-role" });
  assert.deepEqual(resolveTarget({ kind: "documents" }, ["admin"], "admin", true), { kind: "no-role" });
  assert.deepEqual(resolveTarget({ kind: "offers", offerId: O }, ["instructor"], "instructor", false), {
    kind: "needs-onboarding",
  });
});

test("launchLinkFor: 그때 계정과 지금 계정이 같을 때만 링크", async () => {
  const { launchLinkFor } = await import("./link.ts");
  const l = { userId: "a", link: "/?tab=offers" };
  assert.equal(launchLinkFor(l, "a"), "/?tab=offers");
  assert.equal(launchLinkFor(l, "b"), null);
  assert.equal(launchLinkFor(l, null), null);
  assert.equal(launchLinkFor(null, "a"), null);
});
