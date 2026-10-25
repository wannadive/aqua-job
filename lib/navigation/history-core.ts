/**
 * 화면 이동·뒤로가기·작성 중 보호의 핵심(순수 로직). 브라우저(window)를 직접 쓰지 않고 env로 받아서
 * node:test에서 가짜 history로 쌓기/닫기 순서를 검사한다(history-core.test.ts).
 * React 훅은 ./use-navigable.ts — 실제 window로 이 핵심을 한 번 만든다.
 *
 * 워너다이브 hooks/use-navigable.ts(운영 검증)를 옮겨 오고 아쿠아잡에 맞게 넓혔다:
 * - 모든 방문 기록 칸에 순번(IDX)을 붙인다 → 폰 뒤로가기가 몇 칸 움직였는지 알 수 있다(작성 중 보호에서 되돌리기).
 * - 앱이 쌓은 칸(덮는 화면·팝업)은 LAYER 표시 + 그 아래 바닥 칸 순번(BASE) + 주소 키별로 열린 칸 순번(OPEN).
 *   → closeLayer('v_x')는 그 키가 열린 칸까지 한 번에 되돌아가고, resetToRoot()는 바닥 칸까지 되돌아간다.
 * - 팝업(Dialog·AlertDialog·Sheet) 칸: 열리면 한 칸, 폰 뒤로가기 = 팝업만 닫힘, 버튼으로 닫으면 그 칸을 조용히 되돌림,
 *   팝업 위에서 화면을 닫으면 팝업 칸까지 함께 넘김, 팝업에서 다른 화면으로 가면 팝업 칸을 바꿔 씀(워너다이브와 같음).
 * - 작성 중 보호: 쓰던 내용이 있는(dirty) 화면이 닫히는 폰 뒤로가기는 먼저 기록을 되돌리고 확인을 묻는다.
 */

export const IDX = "__navIdx";
export const LAYER = "__navLayer";
export const BASE = "__navBase";
export const OPEN = "__navOpen";
export const DIALOG = "__dialog";
export const DIALOG_OVER_LAYER = "__dialogOverLayer";

/** 덮는 화면을 여는 주소 키는 모두 이 접두어로 시작한다(새로 고침하면 지운다 — 화면 안 값은 메모리에만 있으므로) */
export const NAV_PARAM_PREFIX = "v_";

/** 작성 중 나가기 확인 문구 */
export const LEAVE_TEXT = "작성 중인 내용이 사라져요. 나갈까요?";

/** 닫기 연타 막기·popstate가 안 올 때 풀어 주는 시간(워너다이브와 같음) */
export const BACK_PENDING_MS = 800;
/** 되돌리기·바닥으로 가기에서 popstate를 기다리는 최대 시간 */
export const POP_WAIT_MS = 1500;
/**
 * 보내는 중이 뒤로가기를 조용히 막는 최대 시간. 요청이 이보다 오래 걸리면(멈춘 요청) 막지 않고
 * 평소처럼 작성 중 확인으로 넘긴다 — 사용자가 갇히지 않게.
 */
export const BUSY_BLOCK_MAX_MS = 15_000;

type HistoryState = Record<string, unknown> | null | undefined;

export interface NavHistory {
  state: unknown;
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  back(): void;
  go(delta?: number): void;
}

export interface NavEvent {
  isTrusted: boolean;
  stopImmediatePropagation(): void;
}

export interface NavEnv {
  history: NavHistory;
  location: { readonly href: string };
  /** popstate를 다른 듣는 쪽보다 먼저 받도록 capture로 등록한다 */
  addPopStateListener(fn: (e: NavEvent) => void): void;
  addBeforeUnloadListener(fn: (e: { preventDefault(): void; returnValue: unknown }) => void): void;
  /** 앱이 쏘는 동기화용 popstate(isTrusted=false) */
  dispatchSyntheticPopState(state: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
  confirm(message: string): boolean;
  now(): number;
}

/** 작성 중 화면 하나. param이 있으면 그 주소 키가 사라질 때, 없으면 idx 칸 아래로 내려갈 때 닫힘으로 본다 */
export interface LeaveSource {
  isDirty(): boolean;
  /**
   * 보내기(저장·제출 요청)를 시작한 시각, 안 보내는 중이면 null. 보내는 중에는 묻지 않고, 이 화면을 닫는
   * 폰 뒤로가기는 조용히 되돌린다(반쯤 닫힌 화면 방지) — BUSY_BLOCK_MAX_MS까지만.
   */
  busySince?(): number | null;
  param: string | null;
  idx: number | null;
  released: boolean;
}

/**
 * 화면 쪽 상태가 바뀔 때 출처를 맞춘다(useLeaveGuard가 부름 — 순수, 테스트함).
 * - 놓아 준 표시(released)는 작성 중도 보내는 중도 아닐 때만 푼다: 저장 성공으로 놓아 준 뒤 입력이 비워져도
 *   보내는 중이 남아 있으면 놓아 준 그대로(안 그러면 닫힌 시트가 '보내는 중'으로 남아 뒤로가기를 막는다).
 * - anchor 'dirty'의 칸은 처음 작성 중·보내는 중이 된 순간의 칸, 둘 다 끝나면 비운다.
 */
export function syncGuardSource(
  src: LeaveSource,
  s: { dirty: boolean; busy: boolean; anchor: "param" | "mount" | "dirty"; currentIdx: number | null },
): void {
  if (!s.dirty && !s.busy) {
    src.released = false;
    if (s.anchor === "dirty") src.idx = null;
  } else if (s.anchor === "dirty" && src.idx === null && s.currentIdx !== null) {
    src.idx = s.currentIdx;
  }
}

function obj(s: unknown): Record<string, unknown> {
  return s && typeof s === "object" ? (s as Record<string, unknown>) : {};
}

export function idxOf(s: unknown): number {
  const v = obj(s)[IDX];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

export function isLayer(s: unknown): boolean {
  return obj(s)[LAYER] === true;
}

export function dialogOf(s: unknown): string | null {
  const v = obj(s)[DIALOG];
  return typeof v === "string" ? v : null;
}

function openMap(s: unknown): Record<string, number> {
  const v = obj(s)[OPEN];
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === "number") out[k] = n;
  return out;
}

/** 지금 칸이 레이어면 그 아래 바닥 칸 순번, 아니면 지금 칸 */
export function baseOf(s: unknown, cur: number): number {
  if (!isLayer(s)) return cur;
  const b = obj(s)[BASE];
  return typeof b === "number" && b >= 0 && b <= cur ? b : cur;
}

/** 주소에서 덮는 화면 키(v_…)만 지운 주소. 바뀐 게 없으면 null */
export function stripNavParams(href: string): string | null {
  const url = new URL(href);
  const keys = [...url.searchParams.keys()].filter((k) => k.startsWith(NAV_PARAM_PREFIX));
  if (keys.length === 0) return null;
  for (const k of keys) url.searchParams.delete(k);
  return url.toString();
}

/** 레이어·팝업 표시를 뺀 칸 상태(Next.js 내부 값 등은 그대로) */
function plainState(s: unknown): Record<string, unknown> {
  const next = { ...obj(s) };
  delete next[LAYER];
  delete next[BASE];
  delete next[OPEN];
  delete next[DIALOG];
  delete next[DIALOG_OVER_LAYER];
  return next;
}

export type Navigation = ReturnType<typeof createNavigation>;

export function createNavigation(env: NavEnv) {
  const h = env.history;
  const nativePush = h.pushState.bind(h);
  const nativeReplace = h.replaceState.bind(h);
  const nativeBack = h.back.bind(h);
  const nativeGo = h.go.bind(h);

  let curIdx = idxOf(h.state);
  let backPending = false;
  let backTimer: unknown = null;
  const consumedDialogs = new Set<string>();
  const sources = new Set<LeaveSource>();
  /** 폰 뒤로가기를 되돌리는 중: 그 popstate들은 화면에 전하지 않는다 */
  let restoring: {
    expectIdx: number;
    delta: number;
    affected: LeaveSource[];
    /** 보내는 중이라 되돌리기만(묻지 않음) */
    silent: boolean;
    /** 다시 시도한 go의 이동량(null = 아직 안 함) — 첫 되돌리기가 늦게 오면 둘 다 적용될 수 있다 */
    retryStep: number | null;
    timer: unknown;
  } | null = null;
  /**
   * 되돌리기를 다시 시도한 뒤 제자리로 돌아왔으면, 아직 오지 않은 나머지 go(늦은 첫 시도 또는 재시도)가 기록을
   * 한 번 더 움직일 수 있다. 그 이동(같은 크기 step)은 잠깐 동안 '바로잡기'로 보고 화면에 전하지 않고 되돌린다.
   */
  let correction: {
    /** 남은 go 하나의 이동량 */
    step: number;
    /** 있어야 할 칸 — 남은 go는 여기서 시작해 home+step으로 간다 */
    home: number;
    /** 대기 시한(확인 창이 닫힌 뒤부터 다시 잰다 — 사용자가 답하는 동안 끝나지 않게) */
    until: number;
    returning: boolean;
  } | null = null;
  /** resetToRoot 대기: 바닥 칸에 닿으면 then() */
  let pendingReset: { base: number; then: () => void; timer: unknown } | null = null;
  let dialogSeq = 0;
  /** 열린 팝업들의 popstate 처리(되돌리는 중에는 부르지 않는다) */
  const dialogListeners = new Set<() => void>();

  // ---- 모든 칸에 순번 붙이기 (Next.js가 위에서 감싸도, 우리가 Next.js를 감싸도 동작)
  h.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    const next = { ...obj(data), [IDX]: curIdx + 1 };
    nativePush(next, unused, url);
    curIdx = next[IDX] as number;
  };
  h.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    nativeReplace({ ...obj(data), [IDX]: curIdx }, unused, url);
  };
  // 팝업이 열린 채 화면 닫기(history.back)를 하면 팝업 칸까지 함께 넘김 — 안 그러면 팝업만 닫히고 화면은 그대로 남음.
  // 바닥 화면 위 팝업이면 팝업 칸만(워너다이브 DIALOG_BASE0와 같음)
  h.back = () => {
    const s = h.state;
    const d = dialogOf(s);
    if (d && obj(s)[DIALOG_OVER_LAYER] === true) {
      consumedDialogs.add(d);
      nativeGo(-2);
      return;
    }
    nativeBack();
  };

  const clearBackPending = () => {
    backPending = false;
    if (backTimer != null) env.clearTimeout(backTimer);
    backTimer = null;
  };
  const setBackPending = () => {
    backPending = true;
    if (backTimer != null) env.clearTimeout(backTimer);
    backTimer = env.setTimeout(() => {
      backPending = false;
      backTimer = null;
    }, BACK_PENDING_MS); // popstate가 안 오는 경우 대비
  };

  // 놓아 준 화면(저장 성공 뒤 닫는 중 등)은 보내는 중이어도 막지 않는다 — 앱이 닫는 이동이 되돌려지지 않게
  const busy = (src: LeaveSource) => {
    if (src.released) return false;
    const since = src.busySince?.() ?? null;
    return since !== null && env.now() - since < BUSY_BLOCK_MAX_MS;
  };
  /** 작성 중 = 놓아 주지 않았고, 바뀐 게 있고, 보내는 중이 아님 */
  const active = (src: LeaveSource) => !src.released && !busy(src) && src.isDirty();
  /** 이 이동(newIdx, href)이 그 화면을 닫는가 */
  const closes = (src: LeaveSource, newIdx: number, href: string) => {
    if (src.param) return !new URL(href).searchParams.has(src.param);
    return src.idx != null && newIdx < src.idx;
  };
  const affectedBy = (src: LeaveSource, newIdx: number, href: string) => active(src) && closes(src, newIdx, href);

  /** 기록이 제자리로 돌아온 뒤 묻는다(WebKit: popstate 처리 중 대화상자를 바로 띄우지 않음). 보내는 중이면 되돌리기만 */
  function afterRestored(r: { expectIdx: number; delta: number; affected: LeaveSource[]; silent: boolean }) {
    if (r.silent) return;
    env.setTimeout(() => {
      const leave = env.confirm(LEAVE_TEXT);
      // 확인 창이 떠 있는 동안 도착이 막혀 있던 남은 go가 이제 온다 → 바로잡기 시한을 지금부터 다시 잰다
      if (correction && !correction.returning) {
        correction.until = env.now() + POP_WAIT_MS;
        if (leave) correction.home = r.expectIdx + r.delta; // 나가기: 있어야 할 칸이 바뀜
      }
      if (!leave) return;
      for (const s of r.affected) s.released = true;
      nativeGo(r.delta);
    }, 0);
  }

  /**
   * 되돌리기 popstate가 제때 오지 않음: 한 번 더 시도하고, 그래도 안 되면 지금 기록(주소)에 화면을 맞춘다 —
   * 쓰던 내용은 놓아 주고(이미 주소에서 사라졌다) 동기화 popstate. 화면과 기록이 어긋난 채 남지 않게.
   */
  /** 되돌리기 끝: 다시 시도한 적이 있으면 남은 go를 바로잡을 준비 → 묻기 */
  function finishRestore(r: NonNullable<typeof restoring>) {
    restoring = null;
    env.clearTimeout(r.timer);
    // 두 번 보낸 go 중 하나가 도착했다 → 남은 하나가 늦게 올 수 있다
    if (r.retryStep !== null) {
      correction = { step: r.retryStep, home: r.expectIdx, until: env.now() + POP_WAIT_MS, returning: false };
    }
    afterRestored(r);
  }

  function restoreTimedOut() {
    const r = restoring;
    if (!r) return;
    // popstate 없이 기록만 움직였을 수도 있다 → 실제 지금 칸으로 판단
    curIdx = idxOf(h.state);
    if (curIdx === r.expectIdx) {
      finishRestore(r);
      return;
    }
    if (r.retryStep === null) {
      // 첫 되돌리기가 늦게라도 올 수 있다 — 둘 다 적용되면 finishRestore 뒤 correction이 넘친 이동을 되돌린다
      const step = r.expectIdx - curIdx;
      r.retryStep = step;
      r.timer = env.setTimeout(restoreTimedOut, POP_WAIT_MS);
      nativeGo(step);
      return;
    }
    restoring = null;
    // 두 번 다 실패: 화면을 지금 주소에 맞춘다. 보내는 중이던 화면도 놓아 줘서 닫힘이 거절되지 않게(일관되게 닫힘)
    for (const src of r.affected) src.released = true;
    syncPop(); // 화면 훅·팝업이 지금 주소·칸을 다시 읽는다
  }

  function finishReset() {
    const r = pendingReset;
    if (!r) return;
    pendingReset = null;
    if (r.timer != null) env.clearTimeout(r.timer);
    // 화면들이 popstate로 닫힌 다음에(같은 차례의 다른 듣는 쪽 뒤에) 이어서
    env.setTimeout(r.then, 0);
  }

  // ---- popstate: 다른 듣는 쪽(Next.js·화면 훅·팝업)보다 먼저
  env.addPopStateListener((e) => {
    const prevIdx = curIdx;
    const newIdx = idxOf(h.state);
    clearBackPending();

    if (restoring) {
      // 되돌리는 중의 popstate는 화면에 전하지 않는다(화면은 그대로 있었다)
      e.stopImmediatePropagation();
      curIdx = newIdx;
      if (newIdx === restoring.expectIdx) finishRestore(restoring);
      return;
    }

    if (correction && !correction.returning && env.now() > correction.until) correction = null;
    if (correction) {
      if (correction.returning) {
        const home = correction.home;
        correction = null;
        if (newIdx === home) {
          // 넘친 이동을 되돌린 popstate — 화면에 전하지 않음
          e.stopImmediatePropagation();
          curIdx = newIdx;
          return;
        }
        // 기대한 칸이 아니다 → 바로잡기를 끝내고 이 popstate는 평소대로
      } else if (e.isTrusted && prevIdx === correction.home && newIdx === correction.home + correction.step) {
        // 늦게 도착한 나머지 되돌리기 go가 한 번 더 움직였다 → 바로잡기(새 이동으로 보지 않음)
        e.stopImmediatePropagation();
        curIdx = newIdx;
        correction.returning = true;
        nativeGo(-correction.step);
        return;
      }
    }

    if (e.isTrusted && newIdx !== prevIdx) {
      const href = env.location.href;
      const sending = [...sources].filter((s) => busy(s) && closes(s, newIdx, href));
      // 보내는 중이면 그 화면들만(되돌리기 실패 때 놓아 줄 대상), 아니면 작성 중 화면들
      const affected = sending.length > 0 ? sending : [...sources].filter((s) => affectedBy(s, newIdx, href));
      if (sending.length > 0 || affected.length > 0) {
        // 이 이동이 보내는 중인 화면을 닫거나(→ 조용히 되돌림) 쓰던 내용을 지운다(→ 되돌린 뒤 확인).
        // 화면에는 전하지 않는다.
        e.stopImmediatePropagation();
        curIdx = newIdx;
        restoring = {
          expectIdx: prevIdx,
          delta: newIdx - prevIdx,
          affected,
          silent: sending.length > 0,
          retryStep: null,
          timer: env.setTimeout(restoreTimedOut, POP_WAIT_MS),
        };
        nativeGo(prevIdx - newIdx);
        return;
      }
    }

    curIdx = newIdx;
    for (const fn of [...dialogListeners]) fn();
    if (pendingReset && newIdx <= pendingReset.base) finishReset();
  });

  // 새로 고침·탭 닫기: 쓰던 내용이 있으면 브라우저 기본 경고(iOS Safari는 지원하지 않음)
  env.addBeforeUnloadListener((e) => {
    if ([...sources].some(active)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // ---- 덮는 화면(주소 키)

  /**
   * 새 화면 칸 쌓기. 지금 맨 위가 팝업 칸이면(팝업에서 버튼 눌러 다른 화면으로) 그 칸을 새 화면으로 바꿔 씀 —
   * 안 그러면 닫힌 팝업 칸이 기록에 남아 뒤로가기를 한 번 더 눌러야 함.
   * changes: 주소 키 → 값(null = 지움)
   */
  function pushLayer(changes: Map<string, string | null>): void {
    const cur = h.state;
    const url = new URL(env.location.href);
    const d = dialogOf(cur);
    const at = d ? curIdx : curIdx + 1;
    const open = openMap(cur);
    for (const [k, v] of changes) {
      if (v === null) {
        url.searchParams.delete(k);
        delete open[k];
      } else {
        if (!url.searchParams.has(k)) open[k] = at;
        url.searchParams.set(k, v);
      }
    }
    const base = isLayer(cur) ? baseOf(cur, curIdx) : curIdx;
    const next: Record<string, unknown> = { [LAYER]: true, [BASE]: base, [OPEN]: open };
    if (d) {
      consumedDialogs.add(d);
      h.replaceState({ ...plainState(cur), ...next }, "", url.toString());
      return;
    }
    h.pushState(next, "", url.toString());
  }

  /** 앱이 쏘는 동기화용 popstate(지금 칸 상태 그대로 — Next.js가 다시 불러오지 않게) */
  function syncPop(): void {
    env.dispatchSyntheticPopState(h.state);
  }

  /**
   * 덮는 화면 닫기 — 앱 안에서 연 화면이면 그 키가 열린 칸 아래로 한 번에 되돌아감(위에 쌓인 하위 화면·팝업까지),
   * 앱이 쌓은 칸이 아니면(새로 고침 등) 주소에서 키만 지우고 화면 동기화.
   */
  function closeLayer(...params: string[]): void {
    if (backPending) return;
    const cur = h.state;
    const here = new URL(env.location.href);
    if (!params.some((p) => here.searchParams.has(p))) {
      // 주소에 이미 그 키가 없다(기록이 먼저 움직였음) → 되돌리지 않고 화면만 주소에 맞춘다(화면이 남아 갇히지 않게)
      syncPop();
      return;
    }
    if (isLayer(cur)) {
      const open = openMap(cur);
      const at = params.map((p) => open[p]).filter((n): n is number => typeof n === "number" && n <= curIdx);
      const from = at.length > 0 ? Math.min(...at) : curIdx;
      const n = curIdx - from + 1;
      setBackPending();
      if (n <= 1) h.back();
      else {
        const d = dialogOf(cur);
        if (d) consumedDialogs.add(d);
        nativeGo(-n);
      }
      return;
    }
    const url = new URL(env.location.href);
    let changed = false;
    for (const p of params) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    }
    if (changed) h.replaceState(plainState(cur), "", url.toString());
    syncPop();
  }

  /**
   * 화면 안 [뒤로] 버튼 — 앱 안에서 쌓은 칸이면 직전 칸으로(history.back), 아니면 fallback.
   * [뒤로]가 '새로 이동'하면 기록이 쌓여 폰 뒤로가기 때 방금 나온 화면으로 되돌아감(워너다이브 2026-10-21)
   */
  function goBackInApp(fallback: () => void): void {
    if (backPending) return;
    if (isLayer(h.state)) {
      setBackPending();
      h.back();
      return;
    }
    fallback();
  }

  /**
   * 덮는 화면·팝업을 모두 닫고 바닥 화면으로 돌아간 뒤 then() — 아래 탭·역할 탭·알림 이동이 쓴다.
   * 기록은 바닥 칸까지 되돌린다(덮는 화면 칸이 남아 뒤로가기가 헛돌지 않게).
   */
  function resetToRoot(then: () => void): void {
    clearBackPending();
    if (pendingReset) {
      // 앞선 요청은 버리고 마지막 것만
      if (pendingReset.timer != null) env.clearTimeout(pendingReset.timer);
      pendingReset = null;
    }
    const cur = h.state;
    const base = baseOf(cur, curIdx);
    const n = curIdx - base;
    // 앱이 정한 이동(탭·역할·알림·로그아웃): 닫히는 화면 중 보내는 중인 것도 막지 않는다(바닥 화면의 입력은 그대로)
    for (const s of sources) if (busy(s) && (s.param !== null || (s.idx != null && s.idx > base))) s.released = true;
    if (n > 0) {
      const d = dialogOf(cur);
      if (d) consumedDialogs.add(d);
      const timer = env.setTimeout(() => finishReset(), POP_WAIT_MS);
      pendingReset = { base, then, timer };
      nativeGo(-n);
      return;
    }
    const stripped = stripNavParams(env.location.href);
    if (stripped || isLayer(cur) || dialogOf(cur)) {
      h.replaceState(plainState(cur), "", stripped ?? env.location.href);
      syncPop();
    }
    then();
  }

  /** 첫 화면: 새로 고침 전의 덮는 화면 키·표시를 지운다(값은 메모리에만 있었으므로 다시 열 수 없다) */
  function cleanOnLoad(): void {
    const cur = h.state;
    const stripped = stripNavParams(env.location.href);
    if (!stripped && !isLayer(cur) && !dialogOf(cur)) return;
    h.replaceState(plainState(cur), "", stripped ?? env.location.href);
  }

  // ---- 팝업(Dialog·AlertDialog·Sheet)

  /**
   * 팝업이 열림 → 기록 한 칸. onBackClose: 폰 뒤로가기 등으로 팝업 칸이 사라졌을 때(팝업을 닫아야 함).
   * 돌려준 함수: 팝업이 닫힐 때(버튼 등) 부른다 — 칸이 아직 맨 위면 조용히 되돌린다.
   */
  function openDialog(onBackClose: () => void): () => void {
    const id = `d${++dialogSeq}`;
    const cur = h.state;
    const overLayer = dialogOf(cur) ? obj(cur)[DIALOG_OVER_LAYER] === true : isLayer(cur);
    const next = {
      ...obj(cur),
      [DIALOG]: id,
      [DIALOG_OVER_LAYER]: overLayer,
      [LAYER]: true,
      [BASE]: baseOf(cur, curIdx),
    };
    h.pushState(next, "", env.location.href);
    let gone = false;
    const onPop = () => {
      if (gone || dialogOf(h.state) === id) return;
      gone = true;
      dialogListeners.delete(onPop);
      onBackClose();
    };
    dialogListeners.add(onPop);
    return () => {
      dialogListeners.delete(onPop);
      if (gone) return;
      gone = true;
      // 버튼으로 닫힘 → 팝업 칸이 아직 맨 위면 되돌림 (그 사이 새 화면이 쌓였거나 화면 닫기가 가져갔으면 그대로)
      env.setTimeout(() => {
        if (consumedDialogs.delete(id)) return;
        if (dialogOf(h.state) === id) nativeBack();
      }, 0);
    };
  }

  // ---- 작성 중 보호

  function addSource(src: LeaveSource): () => void {
    sources.add(src);
    return () => {
      sources.delete(src);
    };
  }

  /** 이 화면 하나: 작성 중이면 묻는다. 나가기로 했으면 true(이후 같은 이동에서 다시 묻지 않음) */
  function confirmLeave(src: LeaveSource): boolean {
    if (!active(src)) return true;
    if (!env.confirm(LEAVE_TEXT)) return false;
    src.released = true;
    return true;
  }

  /** 열려 있는 모든 작성 중 화면: 하나라도 있으면 한 번만 묻는다 */
  /** 덮는 화면·팝업의 작성 중만(바닥 화면의 입력은 그대로 둔다) — 같은 탭을 다시 눌러 덮는 화면만 닫을 때 */
  function confirmLeaveLayers(): boolean {
    const base = baseOf(h.state, curIdx);
    const list = [...sources].filter((s) => active(s) && (s.param !== null || (s.idx != null && s.idx > base)));
    if (list.length === 0) return true;
    if (!env.confirm(LEAVE_TEXT)) return false;
    for (const s of list) s.released = true;
    return true;
  }

  /** 바닥 화면인가(덮는 화면·팝업 칸도, 덮는 화면 주소 키도 없음) */
  function isAtRoot(): boolean {
    return !isLayer(h.state) && stripNavParams(env.location.href) === null;
  }

  function confirmLeaveAll(): boolean {
    const list = [...sources].filter(active);
    if (list.length === 0) return true;
    if (!env.confirm(LEAVE_TEXT)) return false;
    for (const s of list) s.released = true;
    return true;
  }

  function hasDirty(): boolean {
    return [...sources].some(active);
  }

  return {
    get currentIdx() {
      return curIdx;
    },
    pushLayer,
    closeLayer,
    goBackInApp,
    resetToRoot,
    cleanOnLoad,
    openDialog,
    addSource,
    confirmLeave,
    confirmLeaveAll,
    confirmLeaveLayers,
    isAtRoot,
    hasDirty,
    syncPop,
  };
}
