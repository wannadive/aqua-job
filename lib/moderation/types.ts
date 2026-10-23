// 신고 · 관리자 조치(011) 화면용 타입. DB 값 목록은 lib/supabase/database.types.ts와 같다.
import type { ReportStatus, ReportTargetType, ViolationReason } from "../supabase/database.types.ts";

export type { ReportStatus, ReportTargetType, ViolationReason };

export type AccountStatusValue = "active" | "suspended" | "banned";
export type JobStatusValue = "open" | "full" | "expired" | "closed" | "hidden";

/** 신고하기 대상(화면이 넘긴다). label은 시트 위에 보이는 이름(공고 제목·센터명·강사 이름) */
export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  label: string;
}

/** 관리자 신고 목록 한 줄(admin_list_reports) — 연락처·서류 칸 없음 */
export interface AdminReport {
  id: string;
  reporterId: string;
  reporterName: string | null;
  targetType: ReportTargetType;
  targetId: string;
  /** 공고 주인 · 회원 · 센터 주인(대상이 지워졌으면 null) */
  targetUserId: string | null;
  targetTitle: string | null;
  targetCenterName: string | null;
  targetJobStatus: JobStatusValue | null;
  targetAccountStatus: AccountStatusValue | null;
  targetOpenReports: number;
  reason: ViolationReason;
  note: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

/** 관리자 조치 종류(확인 창 문구·버튼 라벨) */
export type ModerationAction = "hide_job" | "suspend" | "ban" | "reactivate" | "resolve" | "dismiss";
