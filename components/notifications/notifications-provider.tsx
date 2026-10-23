"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { fetchUnreadCount, listNotifications, markAllRead, markRead, markReadByLink } from "@/lib/notifications/api";
import { NOTIFICATION_PAGE_SIZE } from "@/lib/notifications/config";
import { canLoadMore, nextListLimit, shouldRefresh, UNREAD_POLL_MS } from "@/lib/notifications/format";
import { disablePush, enablePush, readPushState, registerServiceWorker } from "@/lib/notifications/push-client";
import type { PushState } from "@/lib/notifications/push-state";
import type { AquaNotification } from "@/lib/notifications/types";

type PushCtx = {
  /** null = 확인 중 */
  state: PushState | null;
  checkError: boolean;
  busy: boolean;
  refresh(): Promise<void>;
  /** 버튼 누름 처리 안에서 바로 부를 것(권한 요청) */
  enable(): void;
  disable(): void;
};

type NotificationsCtx = {
  unread: number | null;
  refreshUnread(force?: boolean): Promise<void>;
  panelOpen: boolean;
  openPanel(): void;
  closePanel(): void;
  items: AquaNotification[] | null;
  listLoading: boolean;
  listError: boolean;
  hasMore: boolean;
  reloadList(): Promise<void>;
  loadMore(): Promise<void>;
  markingAll: boolean;
  markAll(): Promise<void>;
  /** 알림 하나 누름: 읽음 표시 → 목록 닫기 → 링크로 이동 → 안 읽은 개수 다시 */
  openItem(n: AquaNotification): Promise<void>;
  push: PushCtx;
};

const Ctx = createContext<NotificationsCtx | null>(null);

export function useNotifications(): NotificationsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotifications는 NotificationsProvider 안에서만 쓸 수 있어요");
  return c;
}

/**
 * 로그인한 한 사람의 알림 상태. 셸이 key={사용자 id}로 감싸서, 계정이 바뀌거나 로그아웃하면 통째로 사라진다
 * (앞 사람 알림이 잠깐이라도 보이지 않게).
 * - 안 읽은 개수: 처음·화면 보임·포커스·목록에서 이동한 뒤 + 화면이 보일 때만 60초마다. 숨겨진 탭에서는 부르지 않는다.
 * - 이동은 셸이 준 onOpenLink(link)가 한다(링크 해석·역할 확인은 셸 쪽 lib/notifications/link).
 */
export function NotificationsProvider({
  children,
  onOpenLink,
  scope,
  launchLink = null,
}: {
  children: ReactNode;
  onOpenLink: (link: string | null) => void;
  /** 푸시를 눌러 열린 앱 안 주소(검증된 것). 그 링크의 내 안 읽은 알림을 읽음으로 바꾼다 */
  launchLink?: string | null;
  /** 보고 있는 역할 화면. 바뀌면 열린 목록을 닫는다 */
  scope?: string | null;
}) {
  const [unread, setUnread] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [items, setItems] = useState<AquaNotification[] | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [pushCheckError, setPushCheckError] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const alive = useRef(true);
  const unreadSeq = useRef(0);
  const lastUnreadAt = useRef<number | null>(null);
  const unreadInFlight = useRef(false);
  const listSeq = useRef(0);
  const limitRef = useRef(NOTIFICATION_PAGE_SIZE);
  const markingAllRef = useRef(false);
  const openingRef = useRef(false);
  const pushBusyRef = useRef(false);
  const panelOpenRef = useRef(false);
  const onOpenLinkRef = useRef(onOpenLink);
  onOpenLinkRef.current = onOpenLink;

  // 역할 화면이 바뀌면 목록을 닫는다
  useEffect(() => {
    panelOpenRef.current = false;
    setPanelOpen(false);
  }, [scope]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refreshUnread = useCallback(async (force = false) => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const now = Date.now();
    if (!force && (unreadInFlight.current || !shouldRefresh(lastUnreadAt.current, now))) return;
    lastUnreadAt.current = now;
    unreadInFlight.current = true;
    const my = ++unreadSeq.current;
    try {
      const n = await fetchUnreadCount();
      if (alive.current && my === unreadSeq.current) setUnread(n);
    } catch {
      // 개수는 다음 기회에 다시(지난 값 유지)
    } finally {
      if (my === unreadSeq.current) unreadInFlight.current = false;
    }
  }, []);

  /** 성공해서 화면에 반영했으면 true */
  const loadList = useCallback(async (lim: number): Promise<boolean> => {
    const my = ++listSeq.current;
    setListLoading(true);
    setListError(false);
    try {
      const list = await listNotifications(lim);
      if (!alive.current || my !== listSeq.current) return false;
      setItems(list);
      setHasMore(canLoadMore(list.length, lim));
      return true;
    } catch {
      if (alive.current && my === listSeq.current) setListError(true);
      return false;
    } finally {
      if (alive.current && my === listSeq.current) setListLoading(false);
    }
  }, []);

  const reloadList = useCallback(async () => {
    await Promise.all([loadList(limitRef.current), refreshUnread(true)]);
  }, [loadList, refreshUnread]);

  const loadMore = useCallback(async () => {
    const next = nextListLimit(limitRef.current);
    if (next === limitRef.current) return;
    // 늘린 개수는 불러오기에 성공했을 때만 확정(실패하면 다음 '더 보기'도 같은 개수로 다시)
    if (await loadList(next)) limitRef.current = next;
  }, [loadList]);

  const openPanel = useCallback(() => {
    limitRef.current = NOTIFICATION_PAGE_SIZE; // 열 때마다 최근 50개부터
    panelOpenRef.current = true;
    setPanelOpen(true);
    void reloadList();
  }, [reloadList]);

  const closePanel = useCallback(() => {
    panelOpenRef.current = false;
    setPanelOpen(false);
  }, []);

  const markAll = useCallback(async () => {
    if (markingAllRef.current) return;
    markingAllRef.current = true;
    setMarkingAll(true);
    try {
      const res = await markAllRead();
      if (!alive.current) return;
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("모두 읽음으로 표시했어요");
      await Promise.all([loadList(limitRef.current), refreshUnread(true)]);
    } finally {
      markingAllRef.current = false;
      if (alive.current) setMarkingAll(false);
    }
  }, [loadList, refreshUnread]);

  const openItem = useCallback(
    async (n: AquaNotification) => {
      if (openingRef.current) return;
      openingRef.current = true;
      try {
        if (n.readAt == null) {
          const res = await markRead([n.id]);
          if (!alive.current) return;
          if (res.error) {
            toast.error(res.error); // 이동은 그대로 한다(읽음 표시는 다음에 다시)
          } else {
            const at = new Date().toISOString();
            setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, readAt: at } : x)) ?? list);
          }
        }
        panelOpenRef.current = false;
        setPanelOpen(false);
        onOpenLinkRef.current(n.link);
        void refreshUnread(true);
      } finally {
        openingRef.current = false;
      }
    },
    [refreshUnread],
  );

  // 화면이 보일 때만 주기적으로. 숨으면 멈춘다.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(() => void refreshUnread(), UNREAD_POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshUnread();
        if (panelOpenRef.current) void loadList(limitRef.current);
        start();
      } else {
        stop();
      }
    };
    const onFocus = () => void refreshUnread();
    if (document.visibilityState === "visible") {
      void refreshUnread(true);
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshUnread, loadList]);

  // 푸시로 열린 링크의 알림 읽음 표시(한 번만, 실패는 조용히) → 개수 다시
  const launchDone = useRef<string | null>(null);
  useEffect(() => {
    if (!launchLink || launchDone.current === launchLink) return;
    launchDone.current = launchLink;
    void markReadByLink(launchLink).then(() => {
      if (alive.current) void refreshUnread(true);
    });
  }, [launchLink, refreshUnread]);

  // ---- 푸시
  const refreshPush = useCallback(async () => {
    setPushCheckError(false);
    try {
      const s = await readPushState();
      if (alive.current) setPushState(s);
    } catch {
      if (alive.current) setPushCheckError(true);
    }
  }, []);

  useEffect(() => {
    void registerServiceWorker().then(() => refreshPush());
  }, [refreshPush]);

  const enable = useCallback(() => {
    if (pushBusyRef.current) return;
    pushBusyRef.current = true;
    setPushBusy(true);
    // 권한 요청이 누름 처리 안에서 바로 일어나도록 enablePush를 곧바로 부른다(앞에 await 없음)
    enablePush()
      .then((res) => {
        if (!alive.current) return;
        setPushState(res.state);
        setPushCheckError(false);
        if (res.error) toast.error(res.error);
        else if (res.state === "on") toast.success("이 기기에서 알림을 받아요");
      })
      .catch(() => {
        if (alive.current) toast.error("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요");
      })
      .finally(() => {
        pushBusyRef.current = false;
        if (alive.current) setPushBusy(false);
      });
  }, []);

  const disable = useCallback(() => {
    if (pushBusyRef.current) return;
    pushBusyRef.current = true;
    setPushBusy(true);
    disablePush()
      .then((res) => {
        if (!alive.current) return;
        setPushState(res.state);
        if (res.error) toast.error(res.error);
        else toast.success("이 기기의 알림을 껐어요");
      })
      .catch(() => {
        if (alive.current) toast.error("알림을 끄지 못했어요. 다시 시도해 주세요");
      })
      .finally(() => {
        pushBusyRef.current = false;
        if (alive.current) setPushBusy(false);
      });
  }, []);

  const value: NotificationsCtx = {
    unread,
    refreshUnread,
    panelOpen,
    openPanel,
    closePanel,
    items,
    listLoading,
    listError,
    hasMore,
    reloadList,
    loadMore,
    markingAll,
    markAll,
    openItem,
    push: { state: pushState, checkError: pushCheckError, busy: pushBusy, refresh: refreshPush, enable, disable },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
