import type { AdminReportRow } from "../supabase/database.types.ts";
import type { AccountStatusValue, AdminReport, JobStatusValue, ReportStatus, ReportTargetType } from "./types.ts";
import { isViolationReason } from "./logic.ts";

const TARGET_TYPES = new Set<string>(["job", "profile", "center"]);
const REPORT_STATUSES = new Set<string>(["open", "resolved", "dismissed"]);
const ACCOUNT_STATUSES = new Set<string>(["active", "suspended", "banned"]);
const JOB_STATUSES = new Set<string>(["open", "full", "expired", "closed", "hidden"]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * admin_list_reports 한 행 → 화면용. 모르는 값(대상 종류·상태·사유)이 오면 그 행은 버린다(null) —
 * 잘못된 버튼을 그리지 않게. 신고자 id는 관리자 화면 밖으로 내보내지 않는다.
 */
export function adminReportFromRow(row: Partial<AdminReportRow> | null | undefined): AdminReport | null {
  if (!row || typeof row.id !== "string" || typeof row.target_id !== "string") return null;
  if (!TARGET_TYPES.has(String(row.target_type)) || !REPORT_STATUSES.has(String(row.status))) return null;
  if (!isViolationReason(row.reason)) return null;
  const jobStatus = str(row.target_job_status);
  const accountStatus = str(row.target_account_status);
  const open = Number(row.target_open_reports);
  return {
    id: row.id,
    reporterId: str(row.reporter_id) ?? "",
    reporterName: str(row.reporter_name),
    targetType: row.target_type as ReportTargetType,
    targetId: row.target_id,
    targetUserId: str(row.target_user_id),
    targetTitle: str(row.target_title),
    targetCenterName: str(row.target_center_name),
    targetJobStatus: jobStatus && JOB_STATUSES.has(jobStatus) ? (jobStatus as JobStatusValue) : null,
    targetAccountStatus: accountStatus && ACCOUNT_STATUSES.has(accountStatus) ? (accountStatus as AccountStatusValue) : null,
    targetIsAdmin: row.target_is_admin === true,
    targetOpenReports: Number.isFinite(open) && open > 0 ? Math.floor(open) : 0,
    reason: row.reason,
    note: str(row.note),
    status: row.status as ReportStatus,
    createdAt: str(row.created_at) ?? "",
    resolvedAt: str(row.resolved_at),
    resolution: str(row.resolution),
  };
}
