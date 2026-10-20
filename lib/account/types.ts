export type AccountRole = "instructor" | "center" | "admin";
export type AccountStatus = "active" | "suspended" | "banned";

export interface Account {
  id: string;
  /** 대표 역할(가입 역할) */
  role: AccountRole;
  /** 이 계정이 가진 역할 전부. 항상 role을 포함하고 비어 있지 않다 */
  roles: AccountRole[];
  displayName: string;
  accountStatus: AccountStatus;
  onboardingDone: boolean;
}

export interface SignupInput {
  role: "instructor" | "center";
  email: string;
  password: string;
  displayName: string;
  phone: string;
}

export type Route =
  | "intro"
  | "login"
  | "blocked"
  | "instructor-onboarding"
  | "instructor"
  | "center"
  | "admin";
