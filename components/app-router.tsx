"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { SignupSelect } from "@/components/auth/signup-select";
import { IntroSlides } from "@/components/intro/intro-slides";
import { AdminShell } from "@/components/admin/admin-shell";
import { BlockedScreen } from "@/components/shared/blocked-screen";
import { RoleTabs } from "@/components/shared/role-tabs";
import { CenterShell } from "@/components/center/center-shell";
import { InstructorShell } from "@/components/instructor/instructor-shell";
import { ResumeWizard } from "@/components/instructor/resume-wizard";
import { Button } from "@/components/ui/button";
import { routeFor } from "@/lib/account/logic";
import type { AccountRole, SignupInput } from "@/lib/account/types";
import { useAuth } from "@/lib/supabase/auth-provider";

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

  useEffect(() => {
    if (adminPinned && hasAdmin && activeRole !== "admin") setActiveRole("admin");
  }, [adminPinned, hasAdmin, activeRole, setActiveRole]);

  useEffect(() => {
    setIntroSeen(readIntroSeen());
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

  // 여러 역할 계정: 모든 역할 화면 위에 [관리자] [강사] [센터] 탭
  const withRoleTabs = (screen: ReactNode) =>
    user && shownRole && user.roles.length > 1 ? (
      <>
        <RoleTabs
          roles={user.roles}
          value={shownRole}
          onChange={(r) => {
            setAdminPinned(false);
            setActiveRole(r);
          }}
        />
        {screen}
      </>
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
      return withRoleTabs(<ResumeWizard />);
    case "instructor":
      return withRoleTabs(<InstructorShell />);
    case "center":
      return withRoleTabs(<CenterShell />);
    case "admin":
      return withRoleTabs(<AdminShell />);
  }
}
