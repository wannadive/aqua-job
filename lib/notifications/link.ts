import { safeInternalLink } from "./logic.ts";

/**
 * 알림 링크 → 앱 안 이동 대상. 순수 함수(테스트: link.test.ts).
 *
 * 010 트리거가 만드는 주소만 받는다(그 밖은 전부 null = 이동하지 않음):
 *   /                                         홈(계정 정지·퇴출 등)
 *   /?tab=applicants&job=<uuid>[&app=<uuid>]  센터 — 지원자
 *   /?tab=applications&job=<uuid>             강사 — 지원 현황
 *   /?tab=offers&offer=<uuid>                 강사 — 받은 제안
 *   /?tab=documents                           서류(강사 = 내 이력서, 센터 = 설정)
 *   /?tab=jobs&job=<uuid>                     센터 — 내 공고(숨김 알림) / 강사만 있으면 공고 보기
 * 규칙: 앱 안 주소(safeInternalLink)이고, 경로는 '/' 하나, '#' 없음, 탭은 목록 안, 키는 탭마다 정해진 것만,
 * 같은 키 두 번 금지, id는 UUID만. 하나라도 어기면 null.
 */

/** 이 모듈이 아는 역할(셸 타입을 import하지 않으려고 따로 둔다 — lib/app-shell/account/types의 AccountRole과 같은 값) */
export type LinkRole = "admin" | "instructor" | "center";

export type NotificationTarget =
  | { kind: "home" }
  | { kind: "offers"; offerId: string | null }
  | { kind: "applications"; jobId: string | null }
  | { kind: "applicants"; jobId: string | null; appId: string | null }
  | { kind: "jobs"; jobId: string | null }
  | { kind: "documents" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** 탭마다 허용하는 키(tab 제외) */
const ALLOWED_KEYS: Record<Exclude<NotificationTarget["kind"], "home">, readonly string[]> = {
  offers: ["offer"],
  applications: ["job"],
  applicants: ["job", "app"],
  jobs: ["job"],
  documents: [],
};

export const LINK_TABS = Object.keys(ALLOWED_KEYS) as readonly Exclude<NotificationTarget["kind"], "home">[];

function isLinkTab(v: string): v is Exclude<NotificationTarget["kind"], "home"> {
  return (LINK_TABS as readonly string[]).includes(v);
}

/**
 * 쿼리 문자열('?' 없이)을 키→값으로. 같은 키 두 번·빈 키·'%' 인코딩은 거절(null).
 * UUID·탭 이름에는 인코딩이 필요 없으므로 '%'가 있으면 이상한 주소로 본다.
 */
function parseQuery(q: string): Map<string, string> | null {
  const out = new Map<string, string>();
  if (q === "") return out;
  for (const part of q.split("&")) {
    if (part === "" || part.includes("%") || part.includes("+")) return null;
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (out.has(k)) return null;
    out.set(k, v);
  }
  return out;
}

/** 알림의 link(앱 안 주소)를 이동 대상으로. 모르거나 이상하면 null. */
export function parseNotificationLink(link: string | null | undefined): NotificationTarget | null {
  if (typeof link !== "string") return null;
  // 앱 밖 주소·'//'·제어문자 등은 safeInternalLink가 '/'로 바꾼다 → 원래 값과 다르면 거절
  if (safeInternalLink(link) !== link) return null;
  if (link.includes("#")) return null;
  const qi = link.indexOf("?");
  const path = qi === -1 ? link : link.slice(0, qi);
  if (path !== "/") return null;
  if (qi === -1) return { kind: "home" };
  return parseQueryTarget(link.slice(qi + 1));
}

/** 쿼리('?' 없이)만으로 대상 만들기. tab이 없으면 null(홈 이동은 parseNotificationLink의 '/'만). */
export function parseQueryTarget(query: string): NotificationTarget | null {
  const q = parseQuery(query);
  if (!q) return null;
  const tab = q.get("tab");
  if (!tab || !isLinkTab(tab)) return null;
  const allowed = ALLOWED_KEYS[tab];
  for (const k of q.keys()) {
    if (k === "tab") continue;
    if (!allowed.includes(k)) return null;
    if (!isUuid(q.get(k))) return null;
  }
  const id = (k: string) => q.get(k) ?? null;
  switch (tab) {
    case "offers":
      return { kind: "offers", offerId: id("offer") };
    case "applications":
      return { kind: "applications", jobId: id("job") };
    case "applicants":
      return { kind: "applicants", jobId: id("job"), appId: id("app") };
    case "jobs":
      return { kind: "jobs", jobId: id("job") };
    case "documents":
      return { kind: "documents" };
  }
}

/**
 * 첫 화면 주소(location.search)에 알림 링크가 있는지. 푸시를 누르면 '/?tab=…'로 앱이 열린다.
 * - present: 'tab' 키가 있었는지(있으면 주소창을 정리해야 한다 — 이상한 값이어도)
 * - target: 해석된 대상(이상하면 null)
 */
export function readLaunchTarget(search: string): { present: boolean; target: NotificationTarget | null } {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (q === "") return { present: false, target: null };
  const hasTab = q.split("&").some((p) => p === "tab" || p.startsWith("tab="));
  if (!hasTab) return { present: false, target: null };
  return { present: true, target: parseQueryTarget(q) };
}

// ---------------------------------------------------------------------
// 대상 → 역할 화면·탭

export type InstructorTab = "home" | "jobs" | "offers" | "applications" | "resume";
export type CenterTab = "home" | "jobs" | "applicants" | "instructors" | "settings";

export type NavIntent =
  | { role: "instructor"; tab: InstructorTab; jobId: string | null; offerId: string | null }
  | { role: "center"; tab: CenterTab; jobId: string | null; appId: string | null };

export type NavResolution =
  /** 이 역할 화면·탭으로 이동 */
  | { kind: "go"; intent: NavIntent }
  /** 지금 화면 그대로(홈 링크인데 관리자 화면 등) */
  | { kind: "stay" }
  /** 이 계정에 맞는 역할이 없음 */
  | { kind: "no-role" }
  /** 강사 화면인데 이력서 첫 작성(온보딩) 전 */
  | { kind: "needs-onboarding" };

/**
 * 이동 대상을 계정 역할에 맞춰 화면·탭으로. 역할이 없으면 no-role(화면은 그대로 두고 안내).
 * - 제안·지원 현황 → 강사, 지원자 → 센터
 * - 공고(jobs) → 센터가 있으면 센터 내 공고(숨김 알림은 센터에만 간다), 없으면 강사 공고 보기
 * - 서류·홈 → 지금 보고 있는 역할이 강사·센터면 그대로, 아니면 강사 → 센터 순
 */
export function resolveTarget(
  target: NotificationTarget,
  roles: readonly LinkRole[],
  activeRole: LinkRole | null,
  instructorReady: boolean,
): NavResolution {
  const has = (r: LinkRole) => roles.includes(r);
  const instructor = (tab: InstructorTab, jobId: string | null = null, offerId: string | null = null): NavResolution =>
    instructorReady ? { kind: "go", intent: { role: "instructor", tab, jobId, offerId } } : { kind: "needs-onboarding" };
  const center = (tab: CenterTab, jobId: string | null = null, appId: string | null = null): NavResolution => ({
    kind: "go",
    intent: { role: "center", tab, jobId, appId },
  });
  // 서류·홈: 지금 역할 우선. 여러 역할 계정은 바로 쓸 수 있는 역할(이력서 작성 끝난 강사·센터)을 온보딩보다 먼저.
  const preferActive = (): "instructor" | "center" | null => {
    if (activeRole === "instructor" && has("instructor") && (instructorReady || !has("center"))) return "instructor";
    if (activeRole === "center" && has("center")) return "center";
    if (has("instructor") && instructorReady) return "instructor";
    if (has("center")) return "center";
    if (has("instructor")) return "instructor";
    return null;
  };

  switch (target.kind) {
    case "home": {
      if (activeRole === "admin") return { kind: "stay" };
      const r = preferActive();
      if (r === "instructor") return instructor("home");
      if (r === "center") return center("home");
      return { kind: "stay" };
    }
    case "offers":
      return has("instructor") ? instructor("offers", null, target.offerId) : { kind: "no-role" };
    case "applications":
      return has("instructor") ? instructor("applications", target.jobId) : { kind: "no-role" };
    case "applicants":
      return has("center") ? center("applicants", target.jobId, target.appId) : { kind: "no-role" };
    case "jobs":
      if (has("center")) return center("jobs", target.jobId);
      if (has("instructor")) return instructor("jobs", target.jobId);
      return { kind: "no-role" };
    case "documents": {
      const r = preferActive();
      if (r === "instructor") return instructor("resume");
      if (r === "center") return center("settings");
      return { kind: "no-role" };
    }
  }
}

/** 이동하지 못할 때 안내 문구(중립) */
export const NAV_FAIL_TEXT = {
  "no-role": "이 알림은 지금 계정의 화면에서 열 수 없어요",
  "needs-onboarding": "이력서를 먼저 채우면 이 알림을 열 수 있어요",
  invalid: "열 수 없는 알림 주소예요",
} as const;
