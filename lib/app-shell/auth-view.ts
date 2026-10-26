/**
 * 로그인 전 화면(로그인 / 가입 고르기 / 가입)을 새로 고침해도 그대로 두기 위한 저장 값.
 * 이 탭에만(sessionStorage) 두고, 로그인하면 지운다. 저장소를 못 쓰면 그냥 처음 화면.
 */
export type AuthView = "login" | "signup-select" | "signup";
export type SignupRole = "instructor" | "center";
export interface StoredAuthView {
  view: AuthView;
  role: SignupRole;
}

export const AUTH_VIEW_KEY = "aquajob_auth_view";

const VIEWS: readonly AuthView[] = ["login", "signup-select", "signup"];
const ROLES: readonly SignupRole[] = ["instructor", "center"];

export function serializeAuthView(v: StoredAuthView): string {
  return JSON.stringify({ view: v.view, role: v.role });
}

/** 저장된 글자 → 화면 값. 모르는 값·깨진 값은 null */
export function parseAuthView(raw: string | null | undefined): StoredAuthView | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    if (!VIEWS.includes(o.view) || !ROLES.includes(o.role)) return null;
    return { view: o.view, role: o.role };
  } catch {
    return null;
  }
}
