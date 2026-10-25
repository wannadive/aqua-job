import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createNavigation,
  DIALOG,
  idxOf,
  isLayer,
  LEAVE_TEXT,
  stripNavParams,
  type LeaveSource,
  type NavEnv,
  type NavEvent,
} from "./history-core.ts";

/** 브라우저 history 흉내: 칸 목록 + 지금 위치, back/go는 비동기로 popstate(isTrusted) */
function fakeBrowser(startUrl = "https://app.test/") {
  const entries: { state: unknown; url: string }[] = [{ state: null, url: startUrl }];
  let index = 0;
  const pop: ((e: NavEvent) => void)[] = [];
  const unload: ((e: { preventDefault(): void; returnValue: unknown }) => void)[] = [];
  const confirms: string[] = [];
  let answer = true;
  let pending = 0;
  /** 앱 쪽 다른 듣는 쪽(화면 훅 등)이 받은 popstate 수 */
  let delivered = 0;

  const fire = (trusted: boolean) => {
    let stopped = false;
    const e: NavEvent = { isTrusted: trusted, stopImmediatePropagation: () => (stopped = true) };
    for (const fn of pop) {
      fn(e);
      if (stopped) return;
    }
    delivered++;
  };

  const history = {
    get state() {
      return entries[index].state;
    },
    pushState(data: unknown, _u: string, url?: string | URL | null) {
      entries.splice(index + 1);
      entries.push({ state: structuredClone(data), url: url ? String(url) : entries[index].url });
      index++;
    },
    replaceState(data: unknown, _u: string, url?: string | URL | null) {
      entries[index] = { state: structuredClone(data), url: url ? String(url) : entries[index].url };
    },
    back() {
      history.go(-1);
    },
    go(delta = 0) {
      pending++;
      setTimeout(() => {
        pending--;
        const t = Math.max(0, Math.min(entries.length - 1, index + delta));
        if (t === index) return;
        index = t;
        fire(true);
      }, 1);
    },
  };

  const env: NavEnv = {
    history,
    location: {
      get href() {
        return entries[index].url;
      },
    },
    addPopStateListener: (fn) => pop.unshift(fn),
    addBeforeUnloadListener: (fn) => unload.push(fn),
    dispatchSyntheticPopState: () => fire(false),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    confirm: (m) => {
      confirms.push(m);
      return answer;
    },
  };

  return {
    env,
    entries,
    get index() {
      return index;
    },
    get href() {
      return entries[index].url;
    },
    get delivered() {
      return delivered;
    },
    confirms,
    setAnswer(v: boolean) {
      answer = v;
    },
    addListener(fn: (e: NavEvent) => void) {
      pop.push(fn);
    },
    beforeUnload() {
      let prevented = false;
      const e = { preventDefault: () => (prevented = true), returnValue: undefined as unknown };
      for (const fn of unload) fn(e);
      return prevented;
    },
    /** 사용자의 폰 뒤로가기(브라우저 back) — 앱이 감싼 back이 아니라 브라우저 자체 */
    userBack() {
      history.go(-1);
    },
    async settle() {
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 3));
        if (pending === 0) {
          await new Promise((r) => setTimeout(r, 3));
          if (pending === 0) return;
        }
      }
    },
  };
}

function setup(url?: string) {
  const b = fakeBrowser(url);
  // 사용자 브라우저 back은 감싸기 전 것을 쓴다
  const rawGo = b.env.history.go.bind(b.env.history);
  const nav = createNavigation(b.env);
  return { b, nav, userBack: () => rawGo(-1) };
}

function source(over: Partial<LeaveSource> & { dirty?: boolean } = {}): LeaveSource & { dirty: boolean } {
  const s = { dirty: true, param: null, idx: null, released: false, ...over } as LeaveSource & { dirty: boolean };
  s.isDirty = () => s.dirty;
  return s;
}

test("모든 칸에 순번이 붙는다(push는 +1, replace는 그대로)", () => {
  const { b, nav } = setup();
  b.env.history.replaceState({ a: 1 }, "");
  assert.equal(idxOf(b.env.history.state), 0);
  nav.pushLayer(new Map([["v_a", "1"]]));
  assert.equal(idxOf(b.env.history.state), 1);
  assert.equal(nav.currentIdx, 1);
  b.env.history.replaceState({}, "");
  assert.equal(idxOf(b.env.history.state), 1);
});

test("덮는 화면을 쌓고 닫으면 그 칸 아래로 돌아간다", async () => {
  const { b, nav } = setup();
  nav.pushLayer(new Map([["v_a", "1"]]));
  nav.pushLayer(new Map([["v_b", "1"]]));
  assert.equal(b.index, 2);
  assert.match(b.href, /v_a=1&v_b=1/);
  nav.closeLayer("v_b");
  await b.settle();
  assert.equal(b.index, 1);
  assert.match(b.href, /v_a=1/);
  assert.doesNotMatch(b.href, /v_b/);
});

test("하위 단계가 쌓인 화면을 닫으면 그 키가 열린 칸까지 한 번에(go -n)", async () => {
  const { b, nav } = setup();
  nav.pushLayer(new Map([["v_form", "1"]]));
  nav.pushLayer(new Map([["v_step", "fields"]]));
  nav.pushLayer(new Map([["v_step", "preview"]]));
  assert.equal(b.index, 3);
  nav.closeLayer("v_form");
  await b.settle();
  assert.equal(b.index, 0);
  assert.equal(stripNavParams(b.href), null);
});

test("닫기 연타는 한 번만 되돌린다", async () => {
  const { b, nav } = setup();
  nav.pushLayer(new Map([["v_a", "1"]]));
  nav.pushLayer(new Map([["v_b", "1"]]));
  nav.closeLayer("v_b");
  nav.closeLayer("v_b");
  await b.settle();
  assert.equal(b.index, 1);
});

test("앱이 쌓은 칸이 아니면(새로 고침 뒤) 주소 키만 지우고 동기화 popstate", () => {
  const { b, nav } = setup("https://app.test/?v_a=1");
  const before = b.delivered;
  nav.closeLayer("v_a");
  assert.equal(b.index, 0);
  assert.equal(b.href, "https://app.test/");
  assert.equal(b.delivered, before + 1);
});

test("goBackInApp: 쌓은 칸이면 back, 아니면 fallback", async () => {
  const { b, nav } = setup();
  let fb = 0;
  nav.goBackInApp(() => fb++);
  assert.equal(fb, 1);
  nav.pushLayer(new Map([["v_a", "x"]]));
  nav.goBackInApp(() => fb++);
  await b.settle();
  assert.equal(fb, 1);
  assert.equal(b.index, 0);
});

test("팝업: 열면 한 칸, 버튼으로 닫으면 칸을 되돌림, 뒤로가기면 onBackClose", async () => {
  const { b, nav, userBack } = setup();
  let closedByBack = 0;
  const dispose = nav.openDialog(() => closedByBack++);
  assert.equal(b.index, 1);
  assert.ok(b.env.history.state && (b.env.history.state as Record<string, unknown>)[DIALOG]);
  dispose();
  await b.settle();
  assert.equal(b.index, 0);
  assert.equal(closedByBack, 0);

  const dispose2 = nav.openDialog(() => closedByBack++);
  userBack();
  await b.settle();
  assert.equal(closedByBack, 1);
  dispose2(); // 이미 닫힘 → 아무것도 안 함
  await b.settle();
  assert.equal(b.index, 0);
});

test("팝업 위에서 화면 닫기(history.back)는 팝업 칸까지 함께 넘긴다", async () => {
  const { b, nav } = setup();
  nav.pushLayer(new Map([["v_a", "1"]]));
  let closed = 0;
  const dispose = nav.openDialog(() => closed++);
  assert.equal(b.index, 2);
  nav.closeLayer("v_a");
  await b.settle();
  assert.equal(b.index, 0);
  assert.equal(closed, 1);
  dispose();
  await b.settle();
  assert.equal(b.index, 0, "팝업 정리가 한 칸 더 되돌리지 않는다");
});

test("바닥 화면 위 팝업에서 back은 팝업 칸만", async () => {
  const { b, nav } = setup();
  nav.openDialog(() => {});
  b.env.history.back();
  await b.settle();
  assert.equal(b.index, 0);
});

test("팝업에서 다른 화면으로 가면 팝업 칸을 바꿔 쓴다(뒤로가기 한 번이면 원래 화면)", async () => {
  const { b, nav } = setup();
  let closed = 0;
  const dispose = nav.openDialog(() => closed++);
  nav.pushLayer(new Map([["v_job", "1"]]));
  assert.equal(b.index, 1);
  assert.ok(isLayer(b.env.history.state));
  assert.equal((b.env.history.state as Record<string, unknown>)[DIALOG], undefined);
  dispose();
  await b.settle();
  assert.equal(b.index, 1, "바꿔 쓴 칸은 되돌리지 않는다");
  nav.closeLayer("v_job");
  await b.settle();
  assert.equal(b.index, 0);
});

test("resetToRoot: 덮는 화면·팝업을 모두 닫고 바닥에서 then", async () => {
  const { b, nav } = setup();
  nav.pushLayer(new Map([["v_a", "1"]]));
  nav.pushLayer(new Map([["v_b", "1"]]));
  nav.openDialog(() => {});
  let done = 0;
  nav.resetToRoot(() => done++);
  await b.settle();
  assert.equal(b.index, 0);
  assert.equal(done, 1);
  // 바닥이면 바로
  nav.resetToRoot(() => done++);
  assert.equal(done, 2);
});

test("resetToRoot는 앱 바닥 칸까지만(그 아래 다른 페이지 칸은 건드리지 않음)", async () => {
  const { b, nav } = setup();
  b.env.history.pushState({ page: "/" }, "", "https://app.test/"); // 다른 페이지에서 앱으로 온 칸
  nav.pushLayer(new Map([["v_a", "1"]]));
  let done = 0;
  nav.resetToRoot(() => done++);
  await b.settle();
  assert.equal(b.index, 1);
  assert.equal(done, 1);
});

test("cleanOnLoad: 새로 고침 전 덮는 화면 키·표시를 지운다", () => {
  const { b, nav } = setup("https://app.test/?auth=login&v_a=1&v_b=2");
  b.env.history.replaceState({ __navLayer: true, keep: 1 }, "");
  nav.cleanOnLoad();
  assert.equal(b.href, "https://app.test/?auth=login");
  assert.equal(isLayer(b.env.history.state), false);
  assert.equal((b.env.history.state as Record<string, unknown>).keep, 1);
});

// ---- 작성 중 보호

test("작성 중 팝업에서 폰 뒤로가기 → 되돌리고 묻기 → 취소면 그대로", async () => {
  const { b, nav, userBack } = setup();
  let closed = 0;
  nav.openDialog(() => closed++);
  const src = source({ idx: nav.currentIdx });
  nav.addSource(src);
  b.setAnswer(false);
  const before = b.delivered;
  userBack();
  await b.settle();
  assert.deepEqual(b.confirms, [LEAVE_TEXT]);
  assert.equal(b.index, 1, "기록이 원래 칸으로 돌아옴");
  assert.equal(closed, 0, "팝업은 닫히지 않음");
  assert.equal(b.delivered, before, "화면 쪽에는 popstate가 가지 않음");
});

test("작성 중 팝업에서 폰 뒤로가기 → 나가기면 팝업이 닫힌다(다시 묻지 않음)", async () => {
  const { b, nav, userBack } = setup();
  let closed = 0;
  nav.openDialog(() => closed++);
  const src = source({ idx: nav.currentIdx });
  nav.addSource(src);
  b.setAnswer(true);
  userBack();
  await b.settle();
  assert.equal(b.confirms.length, 1);
  assert.equal(b.index, 0);
  assert.equal(closed, 1);
  assert.equal(src.released, true);
  assert.equal(nav.confirmLeave(src), true);
  assert.equal(b.confirms.length, 1);
});

test("주소 키로 연 입력 화면: 하위 단계 뒤로가기는 묻지 않고, 화면이 닫히는 뒤로가기만 묻는다", async () => {
  const { b, nav, userBack } = setup();
  nav.pushLayer(new Map([["v_form", "1"]]));
  nav.pushLayer(new Map([["v_step", "fields"]]));
  const src = source({ param: "v_form" });
  nav.addSource(src);
  userBack(); // fields → 첫 단계
  await b.settle();
  assert.equal(b.confirms.length, 0);
  assert.equal(b.index, 1);
  b.setAnswer(false);
  userBack(); // 화면 닫힘
  await b.settle();
  assert.equal(b.confirms.length, 1);
  assert.equal(b.index, 1);
});

test("작성 중이 아니거나 저장 후(release)면 묻지 않는다", async () => {
  const { b, nav, userBack } = setup();
  nav.openDialog(() => {});
  const src = source({ idx: 1, dirty: false });
  nav.addSource(src);
  userBack();
  await b.settle();
  assert.equal(b.confirms.length, 0);
  assert.equal(b.index, 0);

  nav.openDialog(() => {});
  const saved = source({ idx: 1 });
  saved.released = true;
  nav.addSource(saved);
  userBack();
  await b.settle();
  assert.equal(b.confirms.length, 0);
});

test("작성 중 화면 위 팝업만 닫히는 뒤로가기는 묻지 않는다", async () => {
  const { b, nav, userBack } = setup();
  const src = source({ idx: 0 }); // 바닥 화면의 입력
  nav.addSource(src);
  nav.openDialog(() => {});
  userBack();
  await b.settle();
  assert.equal(b.confirms.length, 0);
  assert.equal(b.index, 0);
});

test("confirmLeaveAll: 작성 중이 하나라도 있으면 한 번만 묻고, 나가기면 모두 놓아 준다", () => {
  const { b, nav } = setup();
  const a = source({ idx: 0 });
  const c = source({ idx: 0 });
  nav.addSource(a);
  nav.addSource(c);
  b.setAnswer(false);
  assert.equal(nav.confirmLeaveAll(), false);
  assert.equal(a.released, false);
  b.setAnswer(true);
  assert.equal(nav.confirmLeaveAll(), true);
  assert.equal(b.confirms.length, 2);
  assert.ok(a.released && c.released);
  assert.equal(nav.confirmLeaveAll(), true);
  assert.equal(b.confirms.length, 2);
});

test("빠진 출처(화면 닫힘)는 더 묻지 않는다 · beforeunload는 작성 중일 때만", () => {
  const { b, nav } = setup();
  assert.equal(b.beforeUnload(), false);
  const src = source({ idx: 0 });
  const remove = nav.addSource(src);
  assert.equal(nav.hasDirty(), true);
  assert.equal(b.beforeUnload(), true);
  remove();
  assert.equal(nav.hasDirty(), false);
  assert.equal(b.beforeUnload(), false);
});

test("앱이 쏜 동기화 popstate(isTrusted=false)는 막지 않는다", () => {
  const { b, nav } = setup("https://app.test/?v_a=1");
  nav.addSource(source({ param: "v_a" }));
  const before = b.delivered;
  nav.closeLayer("v_a");
  assert.equal(b.delivered, before + 1);
  assert.equal(b.confirms.length, 0);
});
