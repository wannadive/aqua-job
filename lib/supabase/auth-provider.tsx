"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createClient } from "./client";
import type { Account, AccountRole, AccountStatus, SignupInput } from "@/lib/account/types";

interface AuthContextType {
  user: Account | null;
  isLoading: boolean;
  /** 계정 정보 조회 실패(일시 오류). user가 없으면 화면에서 다시 시도 버튼을 보여준다 */
  loadError: boolean;
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
  const [loadError, setLoadError] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  // 오류(네트워크 등)와 "행이 없음"을 구분한다. 오류면 ok:false.
  const fetchAccount = useCallback(
    async (userId: string): Promise<{ ok: true; account: Account | null } | { ok: false }> => {
      const { data: p, error } = await supabase
        .from("profiles")
        .select("id, role, display_name, account_status")
        .eq("id", userId)
        .maybeSingle();
      if (error) return { ok: false };
      if (!p) return { ok: true, account: null };
      const role = p.role as AccountRole;
      let onboardingDone = true;
      if (role === "instructor") {
        const { data: ip, error: ipError } = await supabase
          .from("instructor_profiles")
          .select("onboarding_done")
          .eq("user_id", userId)
          .maybeSingle();
        if (ipError) return { ok: false };
        onboardingDone = ip?.onboarding_done === true; // 행이 아직 없으면 온보딩 전
      }
      return {
        ok: true,
        account: {
          id: p.id,
          role,
          displayName: p.display_name,
          accountStatus: p.account_status as AccountStatus,
          onboardingDone,
        },
      };
    },
    [supabase],
  );

  // 최신 요청 결과만 반영한다. 오류면 기존 사용자 상태를 그대로 둔다(로그아웃·온보딩으로 강등 금지).
  const loadAccount = useCallback(
    async (userId: string): Promise<boolean> => {
      const req = ++requestRef.current;
      let res: Awaited<ReturnType<typeof fetchAccount>>;
      try {
        res = await fetchAccount(userId);
      } catch {
        res = { ok: false };
      }
      if (req !== requestRef.current) return true; // 더 새로운 요청이 있음
      if (!res.ok) {
        setLoadError(true);
        return false;
      }
      setLoadError(false);
      userIdRef.current = res.account ? userId : null;
      setUser(res.account);
      return true;
    },
    [fetchAccount],
  );

  useEffect(() => {
    let settled = false;
    let initialEventSeen = false;
    let cancelled = false;
    const settle = () => {
      settled = true;
      if (!cancelled) setIsLoading(false);
    };

    // INITIAL_SESSION 이벤트가 끝내 안 오는 예외 상황에서만 쓰는 안전망.
    // 이벤트가 온 뒤에는 프로필 조회가 끝날 때까지 로딩을 유지한다(fetch 타임아웃 15초가 상한).
    const timer = setTimeout(() => {
      if (!settled && !initialEventSeen) settle();
    }, FALLBACK_SETTLE_TIMEOUT_MS);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      initialEventSeen = true;
      // 콜백 안에서 supabase를 await 하면 교착될 수 있어 다음 틱으로 미룬다
      setTimeout(async () => {
        if (cancelled) return;
        if (!session?.user) {
          requestRef.current++;
          userIdRef.current = null;
          setUser(null);
          setLoadError(false);
          settle();
          return;
        }
        if (event === "TOKEN_REFRESHED" && userIdRef.current === session.user.id) return;
        const ok = await loadAccount(session.user.id);
        if (cancelled) return;
        if (!ok) toast.error("계정 정보를 불러오지 못했어요. 다시 시도해 주세요");
        settle();
      }, 0);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadAccount]);

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
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: { role: input.role, display_name: input.displayName.trim(), phone: input.phone.trim() },
        },
      });
      if (error) return { error: friendlyError(error.message) };
      if (!data.session) return { error: "가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요." };
      return {};
    },
    [supabase],
  );

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("로그아웃하지 못했어요. 다시 시도해 주세요");
      return;
    }
    requestRef.current++;
    userIdRef.current = null;
    setUser(null);
    setLoadError(false);
  }, [supabase]);

  const refreshAccount = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id;
      if (!id) {
        // 세션이 없으면 로그인 화면으로. 오류 표시도 지워야 다시 시도 화면에 갇히지 않는다.
        requestRef.current++;
        userIdRef.current = null;
        setUser(null);
        setLoadError(false);
        return;
      }
      const ok = await loadAccount(id);
      if (!ok) toast.error("계정 정보를 불러오지 못했어요. 다시 시도해 주세요");
    } catch {
      toast.error("계정 정보를 불러오지 못했어요. 다시 시도해 주세요");
    }
  }, [supabase, loadAccount]);

  return (
    <AuthContext.Provider value={{ user, isLoading, loadError, login, signup, logout, refreshAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 SupabaseAuthProvider 안에서만 쓸 수 있어요");
  return ctx;
}
