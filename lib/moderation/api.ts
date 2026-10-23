import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage, blockedReasonFromBody, cleanNote, reportErrorMessage } from "./logic";
import { adminReportFromRow } from "./mappers";
import type { AccountStatusValue, AdminReport, ReportStatus, ReportTarget, ViolationReason } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// 신고 · 관리자 조치 API (브라우저). 쓰기는 전부 011 RPC — 권한·한도·대상 확인은 서버가 한다.
// job_reports는 칸 권한이 있어 select('*')가 실패한다(처리 메모·처리한 관리자 칸 없음). 관리자는 admin_list_reports로만 읽는다.
// 요청 내용(사유·설명)은 로그에 남기지 않는다.

type Res = { error?: string };

async function write(fn: () => Promise<{ error: any }>, toMessage: (e: any) => string): Promise<Res> {
  try {
    const { error } = await fn();
    return error ? { error: toMessage(error) } : {};
  } catch (e) {
    return { error: toMessage({ message: e instanceof Error ? e.message : "network" }) };
  }
}

// ---------- 회원 ----------

/** 신고하기(submit_report). 성공하면 {} — 신고 id·결과는 화면에 쓰지 않는다. */
export async function submitReport(target: Pick<ReportTarget, "type" | "id">, reason: ViolationReason, note: string | null): Promise<Res> {
  return write(
    () =>
      (createClient() as any).rpc("submit_report", {
        p_target_type: target.type,
        p_target_id: target.id,
        p_reason: reason,
        p_note: cleanNote(note),
      }),
    reportErrorMessage,
  );
}

/**
 * 차단 화면: 내 최근 계정 정지·퇴출 알림 본문에서 사유(없으면 null). aqua_notifications는 본인 행만 보인다(RLS).
 * 오류는 던진다(화면은 중립 문구로 대신한다).
 */
export async function fetchMyBlockedReason(kind: "account_suspended" | "account_banned"): Promise<string | null> {
  const { data, error } = await (createClient().from("aqua_notifications") as any)
    .select("body, created_at")
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("사유를 불러오지 못했어요");
  const row = Array.isArray(data) ? data[0] : null;
  return row ? blockedReasonFromBody(row.body) : null;
}

// ---------- 관리자 ----------

/** 신고 목록(최근 것부터). status null = 전부. 관리자가 아니면 서버가 42501 → 던진다. */
export async function listAdminReports(status: ReportStatus | null, limit = 200): Promise<AdminReport[]> {
  const { data, error } = await (createClient() as any).rpc("admin_list_reports", {
    p_status: status,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) throw new Error(adminErrorMessage(error));
  return ((data ?? []) as any[]).map(adminReportFromRow).filter((r): r is AdminReport => r !== null);
}

/** 신고 대상 계정들의 역할(관리자 계정 조치 버튼을 숨기는 데만 쓴다 — 서버도 막는다). 관리자만 읽힌다. */
export async function fetchAccountRoles(ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return out;
  const { data, error } = await (createClient().from("profiles") as any).select("id, role, roles").in("id", uniq);
  if (error) throw new Error("회원 정보를 불러오지 못했어요");
  for (const p of (data ?? []) as any[]) {
    const roles = Array.isArray(p.roles) && p.roles.length > 0 ? (p.roles as string[]) : p.role ? [String(p.role)] : [];
    out.set(p.id, roles);
  }
  return out;
}

export async function adminHideJob(jobId: string, reason: ViolationReason, note: string | null): Promise<Res> {
  return write(
    () => (createClient() as any).rpc("admin_hide_job", { p_job: jobId, p_reason: reason, p_note: cleanNote(note) }),
    adminErrorMessage,
  );
}

/** 정지·퇴출은 사유 필수, 다시 활성은 사유 없이(설명만 — 관리자 기록) */
export async function adminSetAccountStatus(
  userId: string,
  status: AccountStatusValue,
  reason: ViolationReason | null,
  note: string | null,
): Promise<Res> {
  return write(
    () =>
      (createClient() as any).rpc("admin_set_account_status", {
        p_user: userId,
        p_status: status,
        p_reason: status === "active" ? null : reason,
        p_note: cleanNote(note),
      }),
    adminErrorMessage,
  );
}

export async function adminResolveReport(reportId: string, status: "resolved" | "dismissed", memo: string | null): Promise<Res> {
  return write(
    () =>
      (createClient() as any).rpc("admin_resolve_report", {
        p_report: reportId,
        p_status: status,
        p_resolution: cleanNote(memo),
      }),
    adminErrorMessage,
  );
}

/**
 * 같은 대상의 열린 신고를 모두 같은 결과로 닫는다(조치 뒤 '같은 대상 신고도 처리'). 서버에서 열린 신고를 새로 읽어
 * 하나씩 닫는다 — 그 사이 다른 관리자가 닫은 것은 '이미 처리'로 센다(실패 아님).
 */
export async function resolveOpenReportsForTarget(
  target: { type: string; id: string },
  status: "resolved" | "dismissed",
  memo: string | null,
): Promise<{ done: number; already: number; failed: number }> {
  const open = await listAdminReports("open");
  const mine = open.filter((r) => r.targetType === target.type && r.targetId === target.id);
  const results = await Promise.all(mine.map((r) => adminResolveReport(r.id, status, memo)));
  let done = 0;
  let already = 0;
  let failed = 0;
  for (const r of results) {
    if (!r.error) done += 1;
    else if (r.error.includes("이미 처리된 신고")) already += 1;
    else failed += 1;
  }
  return { done, already, failed };
}
