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
  type NavIntent,
  type NotificationTarget,
} from "@/lib/notifications/link";
import { LoginForm } from "@/components/app-shell/auth/login-form";
import { SignupForm } from "@/components/app-shell/auth/signup-form";
import { SignupSelect } from "@/components/app-shell/auth/signup-select";
import { IntroSlides } from "@/components/app-shell/intro/intro-slides";
import { AdminShell } from "@/components/app-shell/admin-shell";
import { BlockedScreen } from "@/components/app-shell/blocked-screen";
import { ROLE_TABS_HEIGHT, RoleTabs } from "@/components/app-shell/role-tabs";
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
  // 적용한 푸시 링크(그 알림을 읽음으로 바꾸는 데만 쓴다)
  const [launchLink, setLaunchLink] = useState<string | null>(null);
  // 화면 전체 입력 폼(공고 작성 등)이 열려 있으면 종을 숨긴다 — 알림으로 이동하면서 쓰던 내용이 사라지지 않게
  const [fullScreenForm, setFullScreenForm] = useState(false);
  const userId = user?.id ?? null;
  const ready_ = !!user && user.accountStatus === "active";

  // 계정이 바뀌거나 로그아웃하면 남은 이동 요청을 버린다
  useEffect(() => {
    setNav(null);
    setLaunchLink(null);
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

  const openLink = useCallback(
    (link: string | null) => {
      if (link == null) return;
      const t = parseNotificationLink(link);
      if (!t) {
        toast(NAV_FAIL_TEXT.invalid);
        return;
      }
      goTarget(t);
    },
    [goTarget],
  );

  const consumeNav = useCallback(() => setNav(null), []);

  // 첫 화면 주소의 알림 링크: 로그인한 활성 계정이 준비되면 적용(정지·퇴출이면 버림)
  useEffect(() => {
    if (isLoading || !user) return;
    const t = launchTarget.current;
    if (!t) return;
    launchTarget.current = null;
    if (ready_) {
      goTarget(t.target);
      setLaunchLink(t.link);
    }
  }, [isLoading, user, ready_, goTarget]);

  useEffect(() => {
    if (adminPinned && hasAdmin && activeRole !== "admin") setActiveRole("admin");
  }, [adminPinned, hasAdmin, activeRole, setActiveRole]);

  useEffect(() => {
    setIntroSeen(readIntroSeen());
    // 공유 링크에서 온 /?auth=login | signup 은 도입부 없이 해당 화면으로(두 값만 허용)
    try {
      const a = new URLSearchParams(window.location.search).get("auth");
      if (a === "login" || a === "signup") {
        setIntroSeen(true);
        setAuthView(a === "signup" ? "signup-select" : "login");
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
    setReady(true);
  }, []);

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

  // 활성 계정의 역할 화면: 위에 종(알림), 여러 역할 계정은 그 위에 [관리자] [강사] [센터] 탭.
  // 알림 상태는 사용자마다 따로(key) — 계정이 바뀌면 통째로 새로 만든다.
  const withRoleTabs = (screen: ReactNode, showBell = true) =>
    user && shownRole ? (
      <NotificationsProvider key={user.id} onOpenLink={openLink} scope={shownRole} launchLink={launchLink}>
        <div style={user.roles.length > 1 ? { ["--role-tabs-h" as string]: ROLE_TABS_HEIGHT } : undefined}>
          {user.roles.length > 1 && (
            <RoleTabs
              roles={user.roles}
              value={shownRole}
              onChange={(r) => {
                setAdminPinned(false);
                setNav(null);
                setActiveRole(r);
              }}
            />
          )}
          {showBell && <NotificationBar />}
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
      // 첫 이력서 작성도 화면 전체 입력 폼 → 종을 숨긴다
      return withRoleTabs(<ResumeWizard onComplete={refreshAccount} />, false);
    case "instructor":
      return withRoleTabs(
        <InstructorShell nav={nav?.role === "instructor" ? nav : null} onNavConsumed={consumeNav} />,
      );
    case "center":
      return withRoleTabs(
        <CenterShell nav={nav?.role === "center" ? nav : null} onNavConsumed={consumeNav} onFullScreenFormChange={setFullScreenForm} />,
        !fullScreenForm,
      );
    case "admin":
      return withRoleTabs(<AdminShell />);
  }
}
