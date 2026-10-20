export type AccountRole = "instructor" | "center" | "admin";
export type AccountStatus = "active" | "suspended" | "banned";

export interface Account {
  id: string;
  role: AccountRole;
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
