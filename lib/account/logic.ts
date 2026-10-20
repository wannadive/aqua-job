import type { Account, AccountRole, Route } from "./types.ts";

/** 상단 역할 탭 순서 */
export const ROLE_ORDER: readonly AccountRole[] = ["admin", "instructor", "center"];

function isRole(v: unknown): v is AccountRole {
  return typeof v === "string" && (ROLE_ORDER as readonly string[]).includes(v);
}

/**
 * DB의 roles(없거나 이상할 수 있음)와 대표 역할 role로 역할 목록을 만든다.
 * 모르는 값·중복은 버리고, role은 꼭 넣고, ROLE_ORDER 순서로 돌려준다.
 */
export function normalizeRoles(roles: unknown, role: AccountRole): AccountRole[] {
  const set = new Set<AccountRole>([role]);
  if (Array.isArray(roles)) for (const r of roles) if (isRole(r)) set.add(r);
  return ROLE_ORDER.filter((r) => set.has(r));
}

/** 저장된 선택이 없을 때 보여 줄 역할: 관리자가 있으면 관리자, 아니면 가입 역할 */
export function defaultActiveRole(account: Account): AccountRole {
  if (account.roles.includes("admin")) return "admin";
  if (account.roles.includes(account.role)) return account.role;
  return account.roles[0] ?? account.role;
}

/** 저장된 선택(localStorage 등)이 이 계정의 역할이면 그대로, 아니면 기본 역할 */
export function resolveActiveRole(account: Account, stored: string | null | undefined): AccountRole {
  return isRole(stored) && account.roles.includes(stored) ? stored : defaultActiveRole(account);
}

export function routeFor(account: Account | null, introSeen: boolean, activeRole?: string | null): Route {
  if (!account) return introSeen ? "login" : "intro";
  if (account.accountStatus !== "active") return "blocked";
  const role = resolveActiveRole(account, activeRole);
  if (role === "admin") return "admin";
  if (role === "center") return "center";
  return account.onboardingDone ? "instructor" : "instructor-onboarding";
}
