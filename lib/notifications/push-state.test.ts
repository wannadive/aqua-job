import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTryEnable,
  derivePushState,
  detectInAppBrowser,
  isIOSDevice,
  isValidVapidKey,
  logoutWithPushCleanup,
  settleWithin,
  type PushEnv,
} from "./push-state.ts";

const base: PushEnv = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIOS: false,
  standalone: false,
  inApp: null,
  permission: "default",
  vapidKeyValid: true,
  subscribedHere: false,
};

test("derivePushState: 켜짐·꺼짐·차단", () => {
  assert.equal(derivePushState(base), "off");
  assert.equal(derivePushState({ ...base, permission: "granted", subscribedHere: true }), "on");
  // 권한은 있는데 내 구독이 없음(다른 계정 구독을 정리했거나 아직 안 켬)
  assert.equal(derivePushState({ ...base, permission: "granted", subscribedHere: false }), "off");
  // 구독은 남았는데 권한을 기기 설정에서 끔
  assert.equal(derivePushState({ ...base, permission: "denied", subscribedHere: true }), "denied");
  assert.equal(derivePushState({ ...base, permission: "denied" }), "denied");
});

test("derivePushState: 아이폰·지원 안 됨·앱 안 브라우저·키 없음", () => {
  // 아이폰 사파리 탭: PushManager 없음 + 홈 화면 앱 아님
  assert.equal(derivePushState({ ...base, isIOS: true, hasPushManager: false }), "ios-needs-install");
  // 아이폰 홈 화면 앱인데 iOS가 낮아 지원 안 됨
  assert.equal(derivePushState({ ...base, isIOS: true, standalone: true, hasPushManager: false }), "unsupported");
  // 아이폰 홈 화면 앱(16.4+): 켤 수 있음
  assert.equal(derivePushState({ ...base, isIOS: true, standalone: true }), "off");
  assert.equal(derivePushState({ ...base, hasServiceWorker: false }), "unsupported");
  assert.equal(derivePushState({ ...base, inApp: "카카오톡" }), "in-app");
  assert.equal(derivePushState({ ...base, vapidKeyValid: false }), "no-key");
  // 지원 안 되는 브라우저에서는 키 없음보다 지원 안 됨이 먼저
  assert.equal(derivePushState({ ...base, hasNotification: false, vapidKeyValid: false }), "unsupported");
  assert.equal(canTryEnable("off"), true);
  assert.equal(canTryEnable("denied"), true);
  assert.equal(canTryEnable("no-key"), false);
  assert.equal(canTryEnable("on"), false);
});

test("isIOSDevice · detectInAppBrowser", () => {
  assert.equal(isIOSDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), true); // 아이패드 데스크톱 모드
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0), false);
  assert.equal(isIOSDevice("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5), false);
  assert.equal(detectInAppBrowser("Mozilla/5.0 (iPhone) KAKAOTALK 10.0"), "카카오톡");
  assert.equal(detectInAppBrowser("Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit"), "앱 안 브라우저");
  assert.equal(detectInAppBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari"), null);
});

test("isValidVapidKey: 65바이트·0x04 시작 base64url만", () => {
  const raw = Buffer.alloc(65, 9);
  raw[0] = 4;
  const good = raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(isValidVapidKey(good), true);
  const bad0 = Buffer.from(raw);
  bad0[0] = 5;
  assert.equal(isValidVapidKey(bad0.toString("base64url")), false);
  assert.equal(isValidVapidKey(Buffer.alloc(64, 4).toString("base64url")), false);
  assert.equal(isValidVapidKey(""), false);
  assert.equal(isValidVapidKey(undefined), false);
  assert.equal(isValidVapidKey(good.slice(0, -1) + "!"), false);
});

test("settleWithin: 끝남·실패·시간 초과", async () => {
  assert.equal(await settleWithin(async () => 1, 100), "done");
  assert.equal(
    await settleWithin(async () => {
      throw new Error("x");
    }, 100),
    "failed",
  );
  assert.equal(await settleWithin(() => new Promise(() => {}), 20), "timeout");
});

test("logoutWithPushCleanup: 구독 정리 → 로그아웃 순서, 정리가 실패·멈춰도 로그아웃은 한다", async () => {
  const calls: string[] = [];
  await logoutWithPushCleanup({
    detachPush: async () => {
      calls.push("detach:start");
      await new Promise((r) => setTimeout(r, 5));
      calls.push("detach:end");
    },
    signOut: async () => {
      calls.push("signOut");
    },
  });
  assert.deepEqual(calls, ["detach:start", "detach:end", "signOut"]);

  const c2: string[] = [];
  const r = await logoutWithPushCleanup({
    detachPush: async () => {
      throw new Error("offline");
    },
    signOut: async () => {
      c2.push("signOut");
      return "ok";
    },
  });
  assert.equal(r, "ok");
  assert.deepEqual(c2, ["signOut"]);

  const c3: string[] = [];
  const t0 = Date.now();
  await logoutWithPushCleanup({
    detachPush: () => new Promise(() => {}), // 오프라인에서 응답이 영영 안 옴
    signOut: async () => {
      c3.push("signOut");
    },
    timeoutMs: 30,
  });
  assert.deepEqual(c3, ["signOut"]);
  assert.ok(Date.now() - t0 < 1000);
});
