"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { NotificationBar } from "@/components/notifications/notification-bell";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import {
  NAV_FAIL_TEXT,
  parseNotificationLink,
  readLaunchTarget,
  resolveTarget,
  type LaunchLink,
  type NavIntent,
  type NotificationTarget,
} from "@/lib/notifications/link";
import { readSwOpenLink, SW_ACK, type SwOpenLink } from "@/lib/notifications/sw-message";
import { AUTH_VIEW_KEY, parseAuthView, serializeAuthView } from "@/lib/app-shell/auth-view";
import { cleanNavOnLoad, leaveToRoot, resetNavToRoot } from "@/lib/navigation/use-navigable";
import { LoginForm } from "@/components/app-shell/auth/login-form";
import { SignupForm } from "@/components/app-shell/auth/signup-form";
import { SignupSelect } from "@/components/app-shell/auth/signup-select";
import { IntroSlides } from "@/components/app-shell/intro/intro-slides";
import { AdminShell } from "@/components/app-shell/admin-shell";
import { BlockedScreen } from "@/components/app-shell/blocked-screen";
import { RoleTabs, TOP_BAR_HEIGHT } from "@/components/app-shell/role-tabs";
import { CenterShell } from "@/components/app-shell/center-shell";
import { InstructorShell } from "@/components/app-shell/instructor-shell";
import { ResumeWizard } from "@/components/talent-profile/resume-wizard";
import { Button } from "@/components/ui/button";
import { routeFor } from "@/lib/app-shell/account/logic";
import type { AccountRole, SignupInput } from "@/lib/app-shell/account/types";
import { useAuth } from "@/lib/app-shell/auth-provider";

const INTRO_KEY = "aqua.introSeen";

function readIntroSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

function writeIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {
    // 저장이 막힌 환경(사생활 보호 모드 등)에서는 이번 접속에서만 유효
  }
}

export function AppRouter({ adminEntry = false }: { adminEntry?: boolean }) {
  const { user, isLoading, loadError, refreshAccount, logout, activeRole, setActiveRole } = useAuth();
  const [introSeen, setIntroSeen] = useState(false);
  const [ready, setReady] = useState(false);
  const [authView, setAuthView] = useState<"login" | "signup-select" | "signup">("login");
  const [signupRole, setSignupRole] = useState<SignupInput["role"]>("instructor");
  // /admin 주소로 들어오면 관리자 역할이 있는 계정은 관리자 화면부터(탭을 누르기 전까지)
  const [adminPinned, setAdminPinned] = useState(adminEntry);
  const hasAdmin = !!user?.roles.includes("admin");
  const shownRole: AccountRole | null = adminPinned && hasAdmin ? "admin" : activeRole;
  // 알림에서 온 이동 요청(역할 화면이 한 번 적용하고 지운다)
  const [nav, setNav] = useState<(NavIntent & { seq: number }) | null>(null);
  const navSeq = useRef(0);
  // 푸시를 눌러 '/?tab=…'로 열렸을 때의 대상. 로그인한 활성 계정이 생기면 한 번 적용한다(메모리에만 둔다).
  const launchTarget = useRef<{ target: NotificationTarget; link: string } | null>(null);
  // 적용한 푸시 링크(그 알림을 읽음으로 바꾸는 데만 쓴다). 같은 링크가 다시 와도 다시 처리하도록 매번 새 객체
  // 그때 계정 id와 함께 둔다 — 계정이 바뀐 직후 남은 값으로 다른 계정 알림을 읽음 처리하지 않게(launchLinkFor)
  const [launchLink, setLaunchLink] = useState<LaunchLink | null>(null);
  const userId = user?.id ?? null;
  const ready_ = !!user && user.accountStatus === "active";

  // 계정이 바뀌거나 로그아웃하면 남은 이동 요청을 버리고, 덮는 화면 기록 칸·주소 키(v_…)를 바닥까지 정리한다
  // (다음 계정이 앞 계정의 덮는 화면 칸을 물려받지 않게 — 처음 그릴 때는 바닥이라 아무 일 없음)
  const prevUserId = useRef(userId);
  useEffect(() => {
    setNav(null);
    setLaunchLink(null);
    if (prevUserId.current !== userId) {
      const loggedOut = prevUserId.current !== null && userId === null;
      prevUserId.current = userId;
      resetNavToRoot();
      if (loggedOut) {
        // 로그아웃하면 로그인 전 화면은 로그인부터(가입 화면 등 예전 값이 남지 않게)
        setAuthView("login");
        try {
          window.sessionStorage.removeItem(AUTH_VIEW_KEY);
        } catch {
          /* ignore */
        }
      }
    }
  }, [userId]);

  const goTarget = useCallback(
    (target: NotificationTarget) => {
      if (!user || user.accountStatus !== "active") return;
      const r = resolveTarget(target, user.roles, shownRole, user.onboardingDone);
      if (r.kind === "stay") return;
      if (r.kind === "no-role") {
        toast(NAV_FAIL_TEXT["no-role"]);
        return;
      }
      if (r.kind === "needs-onboarding") {
        setAdminPinned(false);
        if (shownRole !== "instructor") setActiveRole("instructor");
        toast(NAV_FAIL_TEXT["needs-onboarding"]);
        return;
      }
      setAdminPinned(false);
      if (r.intent.role !== shownRole) setActiveRole(r.intent.role);
      setNav({ ...r.intent, seq: ++navSeq.current });
    },
    [user, shownRole, setActiveRole],
  );

  // 나중에(기록을 되돌린 뒤) 부르므로 늘 최신 것을 쓴다
  const goTargetRef = useRef(goTarget);
  goTargetRef.current = goTarget;

  /**
   * 알림(종 목록·열린 앱에서 누른 푸시)으로 이동: 작성 중이면 먼저 묻고(취소하면 그대로, false),
   * 덮는 화면·팝업을 모두 닫은 뒤 대상 화면으로. 종과 푸시가 같은 길을 쓴다.
   */
  const openLink = useCallback((link: string | null): boolean => {
    return leaveToRoot(() => {
      if (link == null) return;
      const t = parseNotificationLink(link);
      if (!t) {
        toast(NAV_FAIL_TEXT.invalid);
        return;
      }
      goTargetRef.current(t);
    });
  }, []);

  // 열린 앱 창에서 푸시를 누름(public/sw.js가 보낸 메시지) — 새로 고침 없이 종과 같은 길로 이동
  const handleSwLink = useCallback(
    (r: Exclude<SwOpenLink, { kind: "ignore" }>) => {
      // 세션 복원 중이면 대상만 기억 — 복원이 끝났을 때 로그인돼 있으면 적용, 아니면 버린다(아래 첫 화면 주소 처리와 같은 길)
      if (isLoading) {
        if (r.kind === "open") launchTarget.current = { target: r.target, link: r.link };
        return;
      }
      // 로그인돼 있지 않으면 버린다(나중에 로그인하는 계정이 그 푸시의 주인이라는 보장이 없음)
      if (!user) return;
      if (user.accountStatus !== "active") return;
      if (r.kind === "invalid") {
        toast(NAV_FAIL_TEXT.invalid);
        return;
      }
      const link = r.link;
      leaveToRoot(() => {
        goTargetRef.current(r.target);
        setLaunchLink({ userId: user.id, link });
      });
    },
    [user, isLoading],
  );
  const handleSwLinkRef = useRef(handleSwLink);
  handleSwLinkRef.current = handleSwLink;

  useEffect(() => {
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMessage = (e: MessageEvent) => {
      const r = readSwOpenLink(e.data, e.origin, window.location.origin);
      if (r.kind === "ignore") return;
      // 받았다고 먼저 답한다(답이 없으면 서비스 워커가 창 주소를 바꿔 새로 고침한다)
      try {
        e.ports?.[0]?.postMessage({ type: SW_ACK });
      } catch {
        /* ignore */
      }
      // 확인 창(작성 중)이 메시지 처리 안에서 뜨지 않게 다음 차례에
      window.setTimeout(() => handleSwLinkRef.current(r), 0);
    };
    sw.addEventListener("message", onMessage);
    try {
      sw.startMessages();
    } catch {
      /* ignore */
    }
    return () => sw.removeEventListener("message", onMessage);
  }, []);

  const consumeNav = useCallback(() => setNav(null), []);

  // 첫 화면 주소의 알림 링크: 세션 복원이 끝났을 때 로그인돼 있던 활성 계정에만 적용(정지·퇴출이면 버림).
  // 그때 로그인돼 있지 않았으면 버린다 — 푸시는 로그인한 기기 구독으로만 오고 로그아웃하면 구독이 지워지므로,
  // 나중에 로그인하는 계정이 그 푸시의 주인이라는 보장이 없다(다른 계정에 남의 알림 대상이 적용되지 않게).
  useEffect(() => {
    if (isLoading) return;
    const t = launchTarget.current;
    if (!t) return;
    launchTarget.current = null;
    if (user && ready_) {
      goTarget(t.target);
      setLaunchLink({ userId: user.id, link: t.link });
    }
  }, [isLoading, user, ready_, goTarget]);

  useEffect(() => {
    if (adminPinned && hasAdmin && activeRole !== "admin") setActiveRole("admin");
  }, [adminPinned, hasAdmin, activeRole, setActiveRole]);

  useEffect(() => {
    setIntroSeen(readIntroSeen());
    // 공유 링크에서 온 /?auth=login | signup 은 도입부 없이 해당 화면으로(두 값만 허용)
    try {
      const params = new URLSearchParams(window.location.search);
      const a = params.get("auth");
      if (a === "login" || a === "signup") {
        setIntroSeen(true);
        setAuthView(a === "signup" ? "signup-select" : "login");
      } else {
        // ?auth를 지웠으니 새로 고침 때는 이 탭에 저장해 둔 로그인 전 화면으로(없거나 못 읽으면 처음 화면)
        let stored: ReturnType<typeof parseAuthView> = null;
        try {
          stored = parseAuthView(window.sessionStorage.getItem(AUTH_VIEW_KEY));
        } catch {
          /* ignore */
        }
        if (stored && !adminEntry) {
          setIntroSeen(true);
          setAuthView(stored.view);
          setSignupRole(stored.role);
        }
      }
      // 읽었으면 주소창에서 지운다(로그인 뒤·뒤로 가기·공유에 ?auth가 남지 않게). 다른 쿼리는 그대로
      if (params.has("auth")) {
        params.delete("auth");
        const rest = params.toString();
        window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
      }
    } catch {
      /* ignore */
    }
    // 푸시 알림을 눌러 열린 '/?tab=…': 대상만 기억하고 주소창에서는 바로 지운다(뒤로 가기·공유에 id가 남지 않게)
    try {
      const lt = readLaunchTarget(window.location.search);
      if (lt.present) {
        // 저장된 알림 링크와 같은 모양('/?…')으로 기억한다(읽음 표시용, 해석에 성공한 것만)
        launchTarget.current = lt.target ? { target: lt.target, link: "/" + window.location.search } : null;
        if (lt.target) setIntroSeen(true); // 알림으로 왔으면 도입부 대신 로그인 화면
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
    } catch {
      /* ignore */
    }
    // 새로 고침 전의 덮는 화면 주소 키(v_…)를 지운다 — 화면 안 값은 메모리에만 있어서 다시 열 수 없다
    cleanNavOnLoad();
    setReady(true);
  }, []);

  // 로그인 전 화면을 이 탭에 저장(새로 고침해도 그 화면). 로그인하면 지운다. 도입부·/admin 입구는 저장하지 않는다
  useEffect(() => {
    if (!ready || isLoading) return;
    try {
      if (user) window.sessionStorage.removeItem(AUTH_VIEW_KEY);
      else if (introSeen && !adminEntry) window.sessionStorage.setItem(AUTH_VIEW_KEY, serializeAuthView({ view: authView, role: signupRole }));
    } catch {
      /* ignore */
    }
  }, [ready, isLoading, user, introSeen, adminEntry, authView, signupRole]);

  if (isLoading || !ready) {
    return <main className="flex min-h-dvh items-center justify-center text-sm text-muted">불러오는 중…</main>;
  }

  if (loadError && !user) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="rounded-card bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-ink">계정 정보를 불러오지 못했어요</h1>
          <p className="mt-2 text-sm text-muted">네트워크를 확인하고 다시 시도해 주세요.</p>
          <Button className="mt-6 w-full" onClick={() => void refreshAccount()}>
            다시 시도
          </Button>
          <Button variant="outline" className="mt-2 w-full" onClick={() => void logout()}>
            로그아웃
          </Button>
        </div>
      </main>
    );
  }

  // /admin 주소는 도입부 없이 곧바로 로그인 화면
  const route = routeFor(user, introSeen || adminEntry, shownRole);

  // 활성 계정의 역할 화면: 위 막대(여러 역할 계정은 [관리자] [강사] [센터] 탭 + 종)는 스크롤해도 보이게 고정.
  // 작성 중 화면에서도 종을 숨기지 않는다 — 알림으로 이동할 때 작성 중이면 먼저 묻는다(openLink).
  // 알림 상태는 사용자마다 따로(key) — 계정이 바뀌면 통째로 새로 만든다.
  const withRoleTabs = (screen: ReactNode) =>
    user && shownRole ? (
      <NotificationsProvider key={user.id} userId={user.id} onOpenLink={openLink} scope={shownRole} launchLink={launchLink}>
        <div style={{ ["--role-tabs-h" as string]: TOP_BAR_HEIGHT(user.roles.length > 1) }}>
          <header className="sticky top-0 z-20 bg-bg pt-[env(safe-area-inset-top)]">
            {user.roles.length > 1 && (
              <RoleTabs
                roles={user.roles}
                value={shownRole}
                onChange={(r) => {
                  // 작성 중이면 묻고, 덮는 화면·팝업을 모두 닫은 뒤 역할 화면을 바꾼다
                  leaveToRoot(() => {
                    setAdminPinned(false);
                    setNav(null);
                    setActiveRole(r);
                  });
                }}
              />
            )}
            <NotificationBar />
          </header>
          {screen}
        </div>
        <NotificationPanel />
      </NotificationsProvider>
    ) : (
      screen
    );

  switch (route) {
    case "intro":
      return (
        <IntroSlides
          onFinish={(choice) => {
            writeIntroSeen();
            setIntroSeen(true);
            setAuthView(choice === "signup" ? "signup-select" : "login");
          }}
        />
      );
    case "login":
      if (adminEntry) return <LoginForm isAdminEntry />;
      if (authView === "signup-select")
        return (
          <SignupSelect
            onBack={() => setAuthView("login")}
            onSelect={(r) => {
              setSignupRole(r);
              setAuthView("signup");
            }}
          />
        );
      if (authView === "signup") return <SignupForm role={signupRole} onBack={() => setAuthView("signup-select")} />;
      return <LoginForm onSignup={() => setAuthView("signup-select")} />;
    case "blocked":
      return <BlockedScreen />;
    case "instructor-onboarding":
      return withRoleTabs(<ResumeWizard onComplete={refreshAccount} />);
    case "instructor":
      return withRoleTabs(
        <InstructorShell nav={nav?.role === "instructor" ? nav : null} onNavConsumed={consumeNav} />,
      );
    case "center":
      return withRoleTabs(<CenterShell nav={nav?.role === "center" ? nav : null} onNavConsumed={consumeNav} />);
    case "admin":
      return withRoleTabs(<AdminShell />);
  }
}
