import { createClient } from "@/lib/supabase/client";
import { normalizeRoles } from "./logic";
import type { AccountRole, AccountStatus } from "./types";

export interface MemberRow {
  id: string;
  displayName: string;
  role: AccountRole;
  /** 가진 역할 전부(관리자 → 강사 → 센터 순) */
  roles: AccountRole[];
  accountStatus: AccountStatus;
  createdAt: string;
}

/** 관리자 회원 목록(최근 가입 순). 1단계는 보기만. 오류는 던진다. */
export async function fetchMembers(): Promise<MemberRow[]> {
  const { data, error } = await createClient()
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p: any) => ({
    id: p.id,
    displayName: p.display_name,
    role: p.role as AccountRole,
    roles: normalizeRoles(p.roles, p.role as AccountRole),
    accountStatus: p.account_status as AccountStatus,
    createdAt: p.created_at,
  }));
}
