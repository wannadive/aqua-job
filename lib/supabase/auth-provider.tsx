"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "./client";
import type { Account, AccountRole, AccountStatus, SignupInput } from "@/lib/account/types";

interface AuthContextType {
  user: Account | null;
  isLoading: boolean;
  login(email: string, password: string): Promise<{ error?: string }>;
  signup(input: SignupInput): Promise<{ error?: string }>;
  logout(): Promise<void>;
  refreshAccount(): Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// 세션 복원 안전망: INITIAL_SESSION 이벤트가 끝내 안 오는 예외 상황용.
// (프로필 조회는 fetch 타임아웃(15초)으로 끝나므로 이 3초는 이벤트 누락 시에만 의미가 있다)
const FALLBACK_SETTLE_TIMEOUT_MS = 3000;

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "이메일 또는 비밀번호가 맞지 않아요";
  if (m.includes("already registered") || m.includes("already been registered")) return "이미 가입된 이메일이에요";
  if (m.includes("password") && m.includes("characters")) return "비밀번호는 6자 이상이어야 해요";
  if (m.includes("rate limit") || m.includes("too many")) return "잠시 후 다시 시도해 주세요";
  if (m.includes("invalid") && m.includes("email")) return "이메일 형식을 확인해 주세요";
  if (m.includes("database error saving new user")) return "가입 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("abort")) return "네트워크 연결을 확인해 주세요";
  return "처리하지 못했어요. 잠시 후 다시 시도해 주세요";
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const fetchAccount = useCallback(
    async (userId: string): Promise<Account | null> => {
      const { data: p, error } = await supabase
        .from("profiles")
        .select("id, role, display_name, account_status")
        .eq("id", userId)
        .maybeSingle();
      if (error || !p) return null;
      const role = p.role as AccountRole;
      let onboardingDone = true;
      if (role === "instructor") {
        const { data: ip } = await supabase
          .from("instructor_profiles")
          .select("onboarding_done")
          .eq("user_id", userId)
          .maybeSingle();
        onboardingDone = ip?.onboarding_done === true; // 행이 아직 없으면 온보딩 전
      }
      return {
        id: p.id,
        role,
        displayName: p.display_name,
        accountStatus: p.account_status as AccountStatus,
        onboardingDone,
      };
    },
    [supabase],
  );

  useEffect(() => {
    let settled = false;
    let cancelled = false;
    const settle = () => {
      settled = true;
      if (!cancelled) setIsLoading(false);
    };

    const timer = setTimeout(() => {
      if (!settled) settle();
    }, FALLBACK_SETTLE_TIMEOUT_MS);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // 콜백 안에서 supabase를 await 하면 교착될 수 있어 다음 틱으로 미룬다
      setTimeout(async () => {
        if (cancelled) return;
        if (!session?.user) {
          userIdRef.current = null;
          setUser(null);
          settle();
          return;
        }
        if (event === "TOKEN_REFRESHED" && userIdRef.current === session.user.id) return;
        try {
          const account = await fetchAccount(session.user.id);
          if (cancelled) return;
          userIdRef.current = account ? session.user.id : null;
          setUser(account);
        } catch {
          if (!cancelled) setUser(null);
        } finally {
          settle();
        }
      }, 0);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [supabase, fetchAccount]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { error: friendlyError(error.message) };
      return {};
    },
    [supabase],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const { error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: { role: input.role, display_name: input.displayName.trim(), phone: input.phone.trim() },
        },
      });
      if (error) return { error: friendlyError(error.message) };
      return {};
    },
    [supabase],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    userIdRef.current = null;
    setUser(null);
  }, [supabase]);

  const refreshAccount = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user.id;
    if (!id) {
      setUser(null);
      return;
    }
    const account = await fetchAccount(id);
    setUser(account);
  }, [supabase, fetchAccount]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, refreshAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 SupabaseAuthProvider 안에서만 쓸 수 있어요");
  return ctx;
}
