// 웹 푸시 (브라우저 쪽): 서비스 워커 등록 · 상태 읽기 · 켜기/끄기 · 로그아웃 정리.
// 워너다이브 lib/push/client.ts 방식을 옮김. 판단은 push-state.ts(순수 함수), 서버 호출은 api.ts.
// 아이폰은 iOS 16.4+ 이고 "홈 화면에 추가"한 앱으로 열어야 푸시가 된다(사파리 탭에선 PushManager 없음).
// 푸시 내용·구독 키는 콘솔에 남기지 않는다.

import { isMyPushSubscription, removePushSubscription, savePushSubscription } from "./api";
import { urlBase64ToUint8Array } from "./logic";
import {
  derivePushState,
  detectInAppBrowser,
  isIOSDevice,
  isValidVapidKey,
  settleWithin,
  type PushEnv,
  type PushPermission,
  type PushState,
} from "./push-state";

// 빌드 때 값이 박힌다(Next). 배포 환경에 없으면 빈 글자 → 켜기 막고 '준비 중' 안내.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushResult = { state: PushState; error?: string };

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function supported(): boolean {
  return hasWindow() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isStandalone(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function permission(): PushPermission {
  try {
    const p = typeof Notification !== "undefined" ? Notification.permission : "default";
    return p === "granted" || p === "denied" ? p : "default";
  } catch {
    return "default";
  }
}

function baseEnv(): PushEnv {
  const ua = hasWindow() ? navigator.userAgent : "";
  return {
    hasServiceWorker: hasWindow() && "serviceWorker" in navigator,
    hasPushManager: hasWindow() && "PushManager" in window,
    hasNotification: hasWindow() && "Notification" in window,
    isIOS: hasWindow() && isIOSDevice(ua, navigator.platform ?? "", navigator.maxTouchPoints ?? 0),
    standalone: isStandalone(),
    inApp: detectInAppBrowser(ua),
    permission: permission(),
    vapidKeyValid: isValidVapidKey(VAPID_PUBLIC_KEY),
    subscribedHere: false,
  };
}

async function getRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!hasWindow() || !("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration("/");
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** 앱을 열 때 1회: 서비스 워커 등록(구독 전에 있어야 한다). 실패해도 앱은 그대로. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!hasWindow() || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/**
 * 지금 상태. 브라우저 구독이 있어도 서버에 내 행이 없으면(다른 계정이 남긴 구독·지워진 구독)
 * 이 기기에서 구독을 해제한다 — 공용 폰에서 앞 사람 알림이 계속 오지 않게.
 * 권한을 기기 설정에서 껐는데 구독·행이 남았으면 서버 행도 지운다.
 * 서버 확인이 실패하면 던진다(모를 때는 아무것도 지우지 않음).
 */
export async function readPushState(): Promise<PushState> {
  const env = baseEnv();
  const pre = derivePushState(env);
  if (pre === "in-app" || pre === "unsupported" || pre === "ios-needs-install") return pre;
  const sub = await currentSubscription();
  let mine = false;
  if (sub) {
    mine = await isMyPushSubscription(sub.endpoint);
    if (!mine) {
      await sub.unsubscribe().catch(() => false);
    } else if (env.permission !== "granted") {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe().catch(() => false);
      mine = false;
    }
  }
  return derivePushState({ ...env, subscribedHere: mine });
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const cur = sub.options?.applicationServerKey;
  if (!cur) return true; // 알 수 없으면 그대로 쓴다
  const a = new Uint8Array(cur);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

/**
 * 알림 켜기. 반드시 버튼 누름 처리 안에서 다른 await 없이 바로 부를 것
 * (아이폰은 사용자 동작 안에서만 권한을 물을 수 있다). 권한 요청이 이 함수의 첫 비동기 작업이다.
 */
export async function enablePush(): Promise<PushResult> {
  const env = baseEnv();
  const pre = derivePushState(env);
  if (pre === "in-app" || pre === "unsupported" || pre === "ios-needs-install") return { state: pre };
  if (pre === "no-key") return { state: "no-key", error: "알림 보내기 설정이 아직 준비되지 않았어요" };

  let perm: NotificationPermission;
  try {
    perm = await Notification.requestPermission();
  } catch {
    return { state: "off", error: "알림 권한을 요청하지 못했어요. 다시 눌러 주세요" };
  }
  if (perm === "denied") {
    return { state: "denied", error: "알림이 차단돼 있어요. 휴대폰·브라우저 설정에서 알림을 허용해 주세요" };
  }
  if (perm !== "granted") return { state: "off", error: "알림 허용을 누르지 않아 켜지 않았어요" };

  let sub: PushSubscription;
  try {
    const reg = (await getRegistration()) ?? (await registerServiceWorker());
    if (!reg) return { state: "off", error: "알림 준비(서비스 워커)를 하지 못했어요. 새로고침 후 다시 시도해 주세요" };
    const ready = await settleWithin(() => navigator.serviceWorker.ready, 10_000);
    if (ready !== "done") return { state: "off", error: "알림 준비가 늦어지고 있어요. 잠시 후 다시 시도해 주세요" };
    const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    let existing = await reg.pushManager.getSubscription();
    if (existing && !sameKey(existing, key)) {
      await existing.unsubscribe().catch(() => false);
      existing = null;
    }
    sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }));
  } catch {
    return { state: "off", error: "이 기기에서 알림 구독을 만들지 못했어요. 잠시 후 다시 시도해 주세요" };
  }

  const saved = await savePushSubscription(sub).catch(() => ({ error: "알림을 켜지 못했어요" }));
  if (saved.error) {
    // 서버에 없으면 브라우저 구독도 남기지 않는다(켜짐 표시와 실제가 어긋나지 않게)
    await sub.unsubscribe().catch(() => false);
    return { state: "off", error: `${saved.error}. 잠시 후 다시 시도해 주세요` };
  }
  return { state: "on" };
}

/**
 * 알림 끄기: 서버 행을 지우고 브라우저 구독도 해제한다.
 * 서버 삭제가 실패해도 브라우저 구독을 해제하면 그 주소로는 더 이상 오지 않는다(발송 때 끝난 구독으로 정리됨).
 */
export async function disablePush(): Promise<PushResult> {
  let sub: PushSubscription | null;
  try {
    sub = await currentSubscription();
  } catch {
    return { state: "off", error: "알림 상태를 읽지 못했어요. 다시 시도해 주세요" };
  }
  if (!sub) return { state: derivePushState(baseEnv()) };
  const removed = await removePushSubscription(sub.endpoint).catch(() => ({ error: "알림을 끄지 못했어요" }));
  const unsubscribed = await sub.unsubscribe().catch(() => false);
  if (removed.error && !unsubscribed) return { state: "on", error: "알림을 끄지 못했어요. 다시 시도해 주세요" };
  return { state: derivePushState(baseEnv()) };
}

/**
 * 로그아웃 직전(아직 로그인 상태): 이 기기 구독을 서버에서 지우고 브라우저 구독도 해제.
 * 시간 제한·오류 처리는 부르는 쪽(logoutWithPushCleanup)이 한다. 서버 삭제가 실패해도 브라우저 해제는 한다.
 */
export async function detachPushForLogout(): Promise<void> {
  if (!supported()) return;
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await removePushSubscription(sub.endpoint);
  } finally {
    await sub.unsubscribe().catch(() => false);
  }
}

/**
 * 다른 계정으로 바뀌었거나 이 탭 밖에서 로그아웃됐을 때: 서버 행은 앞 계정 것이라 지울 수 없으니
 * 브라우저 구독만 해제한다(그 주소는 죽고, 발송 때 404/410으로 서버 행도 정리된다).
 */
export async function unsubscribeLocalPush(): Promise<void> {
  if (!supported()) return;
  try {
    const sub = await currentSubscription();
    await sub?.unsubscribe();
  } catch {
    // 무시 — 다음 상태 읽기(readPushState)에서 다시 정리한다
  }
}
