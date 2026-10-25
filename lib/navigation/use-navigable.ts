"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createNavigation, type LeaveSource, type Navigation } from "./history-core.ts";

/**
 * 화면 이동·뒤로가기·작성 중 보호 훅(워너다이브 hooks/use-navigable.ts를 옮겨 옴). 순수 로직은 ./history-core.ts.
 *
 * 규칙(CLAUDE.md "화면 이동·뒤로가기"):
 * - 화면 위에 덮는 화면(상세·이력서 보기·입력 화면·하위 화면)은 useState 대신 useNavigableValue / useNavigableView —
 *   방문 기록에 올라가 폰 뒤로가기(왼쪽 밀기)가 그 화면만 닫는다. 화면 안 닫기·[뒤로]도 같은 길(closeNavigable / goBackInApp).
 * - 팝업(components/ui의 Dialog·Sheet)은 자동으로 기록 한 칸(useBackToClose).
 * - 쓰던 내용이 있는 화면은 useLeaveGuard(dirty) — 폰 뒤로가기·닫기·탭 이동·알림 이동 때 확인, 저장 성공 뒤엔 release().
 * - 아래 탭·역할 탭·알림 이동은 leaveToRoot(then) — 확인 뒤 덮는 화면을 모두 닫고 바닥 화면에서 then().
 * 덮는 화면 주소 키는 'v_'로 시작하고 값(id 등)은 주소에 넣지 않는다(열림 표시만).
 */

let nav: Navigation | null = null;

/** 브라우저에서 한 번만 만든다(모듈을 처음 읽을 때 — Next.js·화면 훅보다 먼저 popstate를 받기 위해) */
function getNav(): Navigation | null {
  if (typeof window === "undefined") return null;
  if (nav) return nav;
  const w = window as Window & { __aquaNav?: Navigation };
  if (w.__aquaNav) {
    nav = w.__aquaNav; // 개발 중 모듈을 다시 읽어도 history를 두 번 감싸지 않게
    return nav;
  }
  nav = createNavigation({
    history: window.history,
    location: window.location,
    addPopStateListener: (fn) => window.addEventListener("popstate", fn, { capture: true }),
    addBeforeUnloadListener: (fn) => window.addEventListener("beforeunload", fn),
    dispatchSyntheticPopState: (state) => window.dispatchEvent(new PopStateEvent("popstate", { state })),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (t) => window.clearTimeout(t as number),
    confirm: (m) => window.confirm(m),
  });
  w.__aquaNav = nav;
  return nav;
}

getNav();

/** 앱 첫 화면에서 한 번: 새로 고침 전의 덮는 화면 키를 지운다(앱 라우터가 부른다) */
export function cleanNavOnLoad(): void {
  getNav()?.cleanOnLoad();
}

/** 덮는 화면 닫기 — 그 키가 열린 칸 아래로 되돌아감(위의 하위 화면·팝업까지 함께) */
export function closeNavigable(...paramNames: string[]): void {
  getNav()?.closeLayer(...paramNames);
}

/** 화면 안 [뒤로] — 앱이 쌓은 칸이면 history.back, 아니면 fallback */
export function goBackInApp(fallback: () => void): void {
  const n = getNav();
  if (n) n.goBackInApp(fallback);
  else fallback();
}

/**
 * 아래 탭·역할 탭·알림 이동: 작성 중이면 확인 → 덮는 화면·팝업을 모두 닫고 바닥 화면에서 then().
 * 취소하면 false(아무것도 안 함).
 */
export function leaveToRoot(then: () => void): boolean {
  const n = getNav();
  if (!n) {
    then();
    return true;
  }
  if (!n.confirmLeaveAll()) return false;
  n.resetToRoot(then);
  return true;
}

/** 작성 중인 화면이 있으면 한 번 묻는다(나가도 되면 true) */
export function confirmLeaveAll(): boolean {
  return getNav()?.confirmLeaveAll() ?? true;
}

// ---- 주소 키 동기화 (같은 차례의 여러 변경은 칸 하나로 — 워너다이브와 같음)
let pendingUpdates: Map<string, string | null> | null = null;

function scheduleFlush(): Map<string, string | null> {
  if (pendingUpdates) return pendingUpdates;
  const m = new Map<string, string | null>();
  pendingUpdates = m;
  queueMicrotask(() => {
    pendingUpdates = null;
    getNav()?.pushLayer(m);
  });
  return m;
}

function readParam(name: string): string | null {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name);
}

/** 주소 키 하나를 상태로. 값을 넣으면 기록에 한 칸, 뒤로가기면 주소에서 다시 읽는다 */
export function useNavigable(paramName: string): [string | null, (value: string | null) => void] {
  const paramRef = useRef(paramName);
  paramRef.current = paramName;
  const [value, setValueState] = useState<string | null>(() => readParam(paramName));

  useEffect(() => {
    const handler = () => setValueState(readParam(paramRef.current));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const setValue = useCallback((next: string | null) => {
    setValueState(next);
    scheduleFlush().set(paramRef.current, next);
  }, []);

  return [value, setValue];
}

/**
 * 화면 안 '하위 화면' 전환을 방문 기록에 올리는 버전. 기본 화면이 아닌 값으로 바꾸면 기록에 쌓이고
 * (뒤로가기 = 직전 화면), 기본 화면으로 돌아갈 땐 그 키가 열린 칸 아래로.
 */
export function useNavigableView<T extends string>(paramName: string, defaultView: T): [T, (next: T) => void] {
  const [raw, setRaw] = useNavigable(paramName);
  const view = (raw ?? defaultView) as T;
  const setView = useCallback(
    (next: T) => {
      if (next === defaultView) {
        if (raw !== null) closeNavigable(paramName);
      } else if (next !== raw) setRaw(next);
    },
    [defaultView, paramName, raw, setRaw],
  );
  return [view, setView];
}

/**
 * 값(편집할 항목·볼 사람 등)을 들고 여는 덮는 화면 — 주소엔 '열림(1)'만, 값은 메모리에.
 * null을 넣으면 닫기(closeNavigable). 새로 고침 뒤 값이 없으면 닫힌 것으로 본다.
 */
export function useNavigableValue<T>(paramName: string): [T | null, (next: T | null) => void] {
  const [flag, setFlag] = useNavigable(paramName);
  const [value, setValue] = useState<T | null>(null);
  const flagRef = useRef(flag);
  flagRef.current = flag;
  const set = useCallback(
    (next: T | null) => {
      if (next === null) {
        if (flagRef.current !== null) closeNavigable(paramName);
        return;
      }
      setValue(next);
      if (flagRef.current === null) setFlag("1");
    },
    [paramName, setFlag],
  );
  return [flag !== null ? value : null, set];
}

/**
 * 팝업(open/onOpenChange로 여닫는 Dialog·Sheet) — 열리면 기록 한 칸, 폰 뒤로가기 = onOpenChange(false).
 * 버튼으로 닫으면 그 칸을 조용히 되돌림. components/ui의 Dialog·Sheet가 자동으로 쓴다.
 * 직접 만든 팝업(fixed inset-0 등)은 useBackToClose(열림, (open) => { if (!open) 닫기() })를 붙일 것.
 */
export function useBackToClose(open: boolean | undefined, onOpenChange?: (open: boolean) => void): void {
  const cbRef = useRef(onOpenChange);
  cbRef.current = onOpenChange;
  const controlled = open !== undefined && !!onOpenChange;
  useEffect(() => {
    if (!open || !controlled) return;
    const n = getNav();
    if (!n) return;
    return n.openDialog(() => cbRef.current?.(false));
  }, [open, controlled]);
}

/**
 * 작성 중 보호. dirty = 처음 값에서 바뀐 것이 있음(여는 것만으로는 아님).
 * - param: 이 화면을 연 주소 키(그 키가 사라지는 뒤로가기만 막는다 — 화면 안 하위 단계 이동은 그대로).
 * - anchor 'mount': 처음 그려진 칸 아래로 내려갈 때 막는다(바닥 화면의 입력 화면). 기본은 처음 바뀐 순간의 칸(팝업 입력).
 * confirmLeave(): 이 화면을 닫기 전에(닫기·취소 버튼, 팝업 바깥 누름) — 작성 중이면 묻는다.
 * release(): 저장 성공 뒤 닫기 전에 — 묻지 않고 나간다.
 */
export function useLeaveGuard(
  dirty: boolean,
  opts: { param?: string; anchor?: "mount" | "dirty" } = {},
): { confirmLeave: () => boolean; release: () => void } {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const srcRef = useRef<LeaveSource | null>(null);
  if (srcRef.current === null) {
    srcRef.current = { isDirty: () => dirtyRef.current, param: opts.param ?? null, idx: null, released: false };
  }
  const src = srcRef.current;
  const anchor = opts.param ? "param" : (opts.anchor ?? "dirty");

  useEffect(() => {
    const n = getNav();
    if (!n) return;
    if (anchor === "mount") src.idx = n.currentIdx;
    return n.addSource(src);
  }, [src, anchor]);

  // 다 지웠거나 저장해서 깨끗해지면 다시 처음부터(다음에 바뀌면 다시 묻는다)
  useEffect(() => {
    const n = getNav();
    if (!dirty) {
      src.released = false;
      if (anchor === "dirty") src.idx = null;
    } else if (anchor === "dirty" && src.idx === null && n) {
      src.idx = n.currentIdx;
    }
  }, [dirty, src, anchor]);

  const confirmLeave = useCallback(() => getNav()?.confirmLeave(src) ?? true, [src]);
  const release = useCallback(() => {
    src.released = true;
  }, [src]);
  return { confirmLeave, release };
}
