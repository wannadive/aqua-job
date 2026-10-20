"use client";

import { useEffect, useState } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { SignupSelect } from "@/components/auth/signup-select";
import { BlockedScreen } from "@/components/shared/blocked-screen";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { routeFor } from "@/lib/account/logic";
import type { SignupInput } from "@/lib/account/types";
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

function Shell({ title, desc }: { title: string; desc: string }) {
  const { user, logout } = useAuth();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-card bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          {user?.displayName}님, {desc}
        </p>
        <Button variant="outline" className="mt-6 w-full" onClick={() => void logout()}>
          로그아웃
        </Button>
      </div>
    </main>
  );
}

export function AppRouter({ adminEntry = false }: { adminEntry?: boolean }) {
  const { user, isLoading, loadError, refreshAccount } = useAuth();
  const [introSeen, setIntroSeen] = useState(false);
  const [ready, setReady] = useState(false);
  const [authView, setAuthView] = useState<"login" | "signup-select" | "signup">("login");
  const [signupRole, setSignupRole] = useState<SignupInput["role"]>("instructor");

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
        </div>
      </main>
    );
  }

  // /admin 주소는 도입부 없이 곧바로 로그인 화면
  const route = routeFor(user, introSeen || adminEntry);

  switch (route) {
    case "intro":
      // Task 5에서 IntroSlides로 교체
      return (
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
          <div className="rounded-card bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{BRAND.appName}</h1>
            <p className="mt-1 text-sm text-muted">{BRAND.tagline}</p>
            <Button
              className="mt-6 w-full"
              onClick={() => {
                writeIntroSeen();
                setIntroSeen(true);
              }}
            >
              시작하기
            </Button>
          </div>
        </main>
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
      return <Shell title="강사 프로필 만들기" desc="곧 열려요" />;
    case "instructor":
      return <Shell title="강사 홈" desc="곧 열려요" />;
    case "center":
      return <Shell title="센터 홈" desc="곧 열려요" />;
    case "admin":
      return <Shell title="관리자" desc="곧 열려요" />;
  }
}
