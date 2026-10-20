import type { Account, Route } from "./types.ts";

export function routeFor(account: Account | null, introSeen: boolean): Route {
  if (!account) return introSeen ? "login" : "intro";
  if (account.accountStatus !== "active") return "blocked";
  if (account.role === "admin") return "admin";
  if (account.role === "center") return "center";
  return account.onboardingDone ? "instructor" : "instructor-onboarding";
}
