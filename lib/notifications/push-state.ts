// 웹 푸시 상태 판단·로그아웃 정리 순서 — 브라우저 API 없이 값만 받는 순수 함수(테스트: push-state.test.ts).
// 브라우저 쪽 실제 호출은 push-client.ts.

export type PushPermission = "default" | "granted" | "denied";

/**
 * on                 이 기기에서 이 계정으로 받는 중(브라우저 구독 + 서버에 내 행)
 * off                켤 수 있음
 * denied             브라우저에서 알림을 차단함 → 휴대폰·브라우저 설정에서 허용 필요
 * unsupported        이 브라우저는 웹 푸시 불가
 * ios-needs-install  아이폰·아이패드: 홈 화면에 추가한 앱으로 열어야 함
 * in-app             카카오톡 등 앱 안 브라우저 → 사파리·크롬으로 다시 열어야 함
 * no-key             서버 설정(VAPID 공개 키)이 아직 없음 → 켤 수 없음
 */
export type PushState = "on" | "off" | "denied" | "unsupported" | "ios-needs-install" | "in-app" | "no-key";

export type PushEnv = {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  standalone: boolean;
  /** 앱 안 브라우저 이름(아니면 null) */
  inApp: string | null;
  permission: PushPermission;
  vapidKeyValid: boolean;
  /** 브라우저 구독이 있고, 서버에 그 주소가 내 행으로 있음 */
  subscribedHere: boolean;
};

export function derivePushState(env: PushEnv): PushState {
  if (env.inApp) return "in-app";
  const supported = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (!supported) return env.isIOS && !env.standalone ? "ios-needs-install" : "unsupported";
  if (!env.vapidKeyValid) return "no-key";
  if (env.permission === "denied") return "denied";
  return env.subscribedHere && env.permission === "granted" ? "on" : "off";
}

/** 상태별 안내(중립 문구) */
export const PUSH_STATE_TEXT: Record<PushState, { label: string; desc: string }> = {
  on: { label: "켜짐", desc: "이 기기로 새 알림을 보내 드려요" },
  off: { label: "꺼짐", desc: "켜면 지원·제안·서류 소식을 이 기기로 받아요" },
  denied: {
    label: "차단됨",
    desc: "브라우저에서 알림이 차단돼 있어요. 휴대폰 설정이나 브라우저 사이트 설정에서 알림을 허용한 뒤 다시 눌러 주세요",
  },
  unsupported: { label: "지원 안 됨", desc: "이 브라우저에서는 알림을 받을 수 없어요. 크롬이나 사파리 최신 버전에서 열어 주세요" },
  "ios-needs-install": {
    label: "홈 화면 추가 필요",
    desc: "아이폰·아이패드는 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요(iOS 16.4 이상)",
  },
  "in-app": { label: "지원 안 됨", desc: "앱 안 브라우저에서는 알림을 켤 수 없어요. 사파리나 크롬으로 다시 열어 주세요" },
  "no-key": { label: "준비 중", desc: "알림 보내기 설정이 아직 준비되지 않았어요. 앱 안 알림(종)은 그대로 볼 수 있어요" },
};

/** 켜기 버튼을 보여 줄 상태 */
export function canTryEnable(s: PushState): boolean {
  return s === "off" || s === "denied";
}

// ---------------------------------------------------------------------
// 브라우저 판별(값만 받는다)

export function isIOSDevice(ua: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
}

const IN_APP: [RegExp, string][] = [
  [/KAKAOTALK/i, "카카오톡"],
  [/NAVER\(inapp/i, "네이버"],
  [/Instagram/i, "인스타그램"],
  [/FBAN|FBAV|FB_IAB/i, "페이스북"],
  [/\bLine\//i, "라인"],
  [/DaumApps/i, "다음"],
];

/** 앱 안 브라우저 이름(아니면 null). 워너다이브 lib/push/inapp.ts와 같은 판별. */
export function detectInAppBrowser(ua: string): string | null {
  const hit = IN_APP.find(([re]) => re.test(ua));
  if (hit) return hit[1];
  if (/Android/i.test(ua) && /;\s*wv\)/.test(ua)) return "앱 안 브라우저";
  return null;
}

/**
 * VAPID 공개 키 형식: base64url, 디코드하면 65바이트이고 0x04로 시작(비압축 P-256 점).
 * 틀린 값으로 subscribe하면 브라우저 오류가 나므로 미리 거른다.
 */
export function isValidVapidKey(key: string | null | undefined): boolean {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{86,88}={0,2}$/.test(key)) return false;
  try {
    const b64 = key.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return raw.length === 65 && raw.charCodeAt(0) === 4;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// 로그아웃 정리 순서

/** 작업이 ms 안에 끝나지 않으면 기다리지 않는다. 작업의 오류도 삼킨다(결과: 끝났는지). */
export async function settleWithin(task: () => Promise<unknown>, ms: number): Promise<"done" | "timeout" | "failed"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((r) => {
    timer = setTimeout(() => r("timeout"), ms);
  });
  const run = (async () => {
    try {
      await task();
      return "done" as const;
    } catch {
      return "failed" as const;
    }
  })();
  try {
    return await Promise.race([run, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 로그아웃: ① 이 기기 푸시 구독을 서버에서 지우고 브라우저 구독도 해제(아직 로그인 상태여야 RLS로 지울 수 있다)
 * → ② 로그아웃. ①은 실패·시간 초과여도 ②를 막지 않는다(로그아웃이 멈추면 안 됨).
 */
export async function logoutWithPushCleanup<T>(opts: {
  detachPush: () => Promise<unknown>;
  signOut: () => Promise<T>;
  timeoutMs?: number;
}): Promise<T> {
  await settleWithin(opts.detachPush, opts.timeoutMs ?? LOGOUT_PUSH_TIMEOUT_MS);
  return opts.signOut();
}

export const LOGOUT_PUSH_TIMEOUT_MS = 2500;
