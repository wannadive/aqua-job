// 신고 · 관리자 조치(011) 순수 로직. 화면·API가 같이 쓴다. 최종 판단은 언제나 서버(RPC)가 한다.
import { jobErrorMessage } from "../jobs/logic.ts";
import type {
  AccountStatusValue,
  JobStatusValue,
  ModerationAction,
  ReportStatus,
  ReportTargetType,
  ViolationReason,
} from "./types.ts";

/** 설명·처리 메모 최대 글자 수 — DB job_violation_note · job_reports_resolution_check(011)와 같다 */
export const NOTE_MAX = 500;
/** 당사자 알림에 붙는 기타 설명 길이 — DB job_violation_notice(011)와 같다 */
export const NOTICE_OTHER_MAX = 80;
/** 같은 대상은 24시간에 한 번, 한 사람 24시간에 20건(011 submit_report) — 안내 문구용 */
export const REPORT_DAILY_LIMIT = 20;

/** 위반 사유(정해진 목록, 011 job_violation_label과 같은 순서·이름) */
export const VIOLATION_REASONS: { value: ViolationReason; label: string }[] = [
  { value: "fake_document", label: "가짜 서류" },
  { value: "false_posting", label: "허위 공고" },
  { value: "contact_harvesting", label: "연락처 수집 목적" },
  { value: "illegal", label: "불법 행위" },
  { value: "other", label: "기타" },
];

const REASON_SET = new Set<string>(VIOLATION_REASONS.map((r) => r.value));

export function isViolationReason(v: unknown): v is ViolationReason {
  return typeof v === "string" && REASON_SET.has(v);
}

/** 사유 → 이름. 목록 밖이면 "알 수 없는 사유" */
export function violationLabel(reason: string | null | undefined): string {
  return VIOLATION_REASONS.find((r) => r.value === reason)?.label ?? "알 수 없는 사유";
}

/** 기타를 고르면 설명이 필요하다(서버 job_violation_note와 같은 규칙) */
export function noteRequired(reason: ViolationReason | null | undefined): boolean {
  return reason === "other";
}

/** DB char_length와 같게 센다(한 글자 = 코드 포인트 하나) */
export function charCount(s: string): number {
  return [...s].length;
}

/** 서버처럼 앞뒤 공백을 지운 설명. 비면 null */
export function cleanNote(note: string | null | undefined): string | null {
  const t = (note ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * 사유·설명 입력 확인(서버 job_violation_note와 같은 규칙). 문제가 없으면 null, 있으면 안내 문구.
 * 사유 없음 → 고르라고, 설명 500자 초과, 기타인데 설명 없음.
 */
export function violationInputError(reason: ViolationReason | null | undefined, note: string | null | undefined): string | null {
  if (!reason || !isViolationReason(reason)) return "사유를 골라 주세요";
  const n = cleanNote(note);
  if (n && charCount(n) > NOTE_MAX) return `설명은 ${NOTE_MAX}자까지 쓸 수 있어요`;
  if (noteRequired(reason) && !n) return "기타를 고르면 설명을 써 주세요";
  return null;
}

/** 다시 활성·처리 메모처럼 사유 없이 설명만 받는 칸 확인 */
export function memoInputError(memo: string | null | undefined): string | null {
  const n = cleanNote(memo);
  if (n && charCount(n) > NOTE_MAX) return `메모는 ${NOTE_MAX}자까지 쓸 수 있어요`;
  return null;
}

/**
 * 당사자 알림에 '사유: …'로 붙는 문구(서버 job_violation_notice와 같다).
 * 기타 = '기타 · <설명 80자, 공백·줄바꿈은 한 칸으로>', 그 밖 = 항목 이름.
 */
export function violationNotice(reason: ViolationReason, note: string | null | undefined): string {
  if (reason === "other") {
    const flat = (note ?? "").trim().replace(/\s+/g, " ");
    return `기타 · ${[...flat].slice(0, NOTICE_OTHER_MAX).join("")}`;
  }
  return violationLabel(reason);
}

/** 설명 칸 안내: 기타의 설명은 당사자에게 사유로 보이고, 그 밖 항목의 설명은 관리자 기록에만 남는다(011) */
export function noteVisibilityHint(reason: ViolationReason | null | undefined): string {
  return reason === "other" ? "당사자에게 보입니다" : "관리자 기록에만 남아요 · 당사자에게 보이지 않아요";
}

// ---------- 표시 라벨 ----------

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: "처리 전",
  resolved: "조치함",
  dismissed: "기각",
};

export const TARGET_TYPE_LABEL: Record<ReportTargetType, string> = {
  job: "공고",
  profile: "강사",
  center: "센터",
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatusValue, string> = {
  active: "활동",
  suspended: "정지",
  banned: "퇴출",
};

/** 신고하기 시트 제목 */
export function reportSheetTitle(type: ReportTargetType): string {
  return `${TARGET_TYPE_LABEL[type]} 신고하기`;
}

/** 신고 접수 안내(그대로) */
export const REPORT_DONE_TEXT = "신고가 접수됐어요";

// ---------- 오류 → 안내 ----------

const NETWORK = /fetch|network|timeout|timed out|abort|load failed/i;

type Err = { code?: string | null; message?: string | null } | null | undefined;

/**
 * 신고(submit_report) 오류 → 할 일을 알려 주는 한국어.
 * 없는 대상 · 볼 수 없는 대상은 서버가 같은 문구(P0002)로 돌려준다 — 화면도 구분하지 않는다.
 */
export function reportErrorMessage(err: Err): string {
  const msg = err?.message ?? "";
  const code = err?.code ?? "";
  if (!code && NETWORK.test(msg)) return "네트워크 연결을 확인하고 다시 시도해 주세요";
  if (msg.includes("이미 신고했어요")) return "이 대상은 이미 신고했어요. 같은 대상은 24시간에 한 번 신고할 수 있어요";
  if (msg.includes("24시간에 20건")) return `신고는 24시간에 ${REPORT_DAILY_LIMIT}건까지 할 수 있어요. 나중에 다시 시도해 주세요`;
  if (msg.includes("내 공고·내 계정")) return "내 공고·내 계정·내 센터는 신고할 수 없어요";
  if (code === "P0002" || msg.includes("신고할 대상을 찾을 수 없어요"))
    return "신고할 대상을 찾을 수 없어요. 이미 내려갔거나 지금 볼 수 없는 대상이에요";
  if (msg.includes("활성 계정만")) return "이용이 멈춘 계정은 신고할 수 없어요";
  if (msg.includes("신고 대상이 올바르지 않아요")) return "신고 대상이 올바르지 않아요. 화면을 닫고 다시 시도해 주세요";
  if (msg.includes("사유를 목록에서")) return "사유를 골라 주세요";
  if (msg.includes("기타를 고르면")) return "기타를 고르면 설명을 써 주세요";
  if (msg.includes("500자")) return `설명은 ${NOTE_MAX}자까지 쓸 수 있어요`;
  if (code === "42501") return "지금은 신고할 수 없어요. 다시 로그인해 주세요";
  return jobErrorMessage(err);
}

/**
 * 관리자 조치·신고 처리 오류 → 한국어. stale(이미 숨김·이미 그 상태·이미 처리)이면 다시 불러오라는 뜻을 담는다.
 */
export function adminErrorMessage(err: Err): string {
  const msg = err?.message ?? "";
  const code = err?.code ?? "";
  if (!code && NETWORK.test(msg)) return "네트워크 연결을 확인하고 다시 시도해 주세요";
  if (msg.includes("관리자만")) return "관리자 권한이 확인되지 않아요. 다시 로그인해 주세요";
  if (msg.includes("이미 숨긴 공고")) return "이미 숨긴 공고예요. 신고는 [처리 완료]로 닫아 주세요";
  if (msg.includes("이미 그 상태")) return "이미 그 상태인 계정이에요. 목록을 새로 불러왔어요";
  if (msg.includes("숨긴 공고가 아니에요")) return "이미 보이는 공고예요. 목록을 새로 불러왔어요";
  if (msg.includes("먼저 계정을 다시 활성으로"))
    return "공고 주인 계정이 정지·퇴출 상태예요. 회원 탭에서 먼저 다시 활성으로 바꿔 주세요";
  if (msg.includes("이미 처리한 신고")) return "이미 처리된 신고예요(다른 관리자가 먼저 처리했을 수 있어요). 목록을 새로 불러왔어요";
  if (msg.includes("내 계정은 바꿀 수 없어요")) return "내 계정은 바꿀 수 없어요";
  if (msg.includes("관리자 계정")) return "관리자 계정이나 그 공고에는 조치할 수 없어요";
  if (msg.includes("공고를 찾을 수 없어요")) return "공고를 찾을 수 없어요. 목록을 새로 불러왔어요";
  if (msg.includes("회원을 찾을 수 없어요")) return "회원을 찾을 수 없어요. 목록을 새로 불러왔어요";
  if (msg.includes("신고를 찾을 수 없어요")) return "신고를 찾을 수 없어요. 목록을 새로 불러왔어요";
  if (msg.includes("사유를 목록에서")) return "사유를 골라 주세요";
  if (msg.includes("기타를 고르면")) return "기타를 고르면 설명을 써 주세요";
  if (msg.includes("500자")) return `설명·메모는 ${NOTE_MAX}자까지 쓸 수 있어요`;
  return jobErrorMessage(err);
}

// ---------- 확인 창 문구 ----------

export interface ConfirmText {
  title: string;
  /** 무슨 일이 일어나는지 — 한 줄씩 */
  lines: string[];
  /** 확인 버튼 라벨 */
  confirm: string;
}

/**
 * 조치 확인 창 문구. 서버(011·012)가 실제로 하는 일을 그대로 적는다.
 * reason·note를 주면 당사자에게 보이는 사유(violationNotice)를 함께 보여 준다.
 * fromStatus: 다시 활성 전 상태(정지 → 바뀐 것 없음, 퇴출 → 숨긴 공고 등은 그대로).
 */
export function confirmText(
  action: ModerationAction,
  ctx: {
    targetName?: string | null;
    reason?: ViolationReason | null;
    note?: string | null;
    fromStatus?: AccountStatusValue | null;
  } = {},
): ConfirmText {
  const name = ctx.targetName?.trim() || null;
  const notice = ctx.reason ? `당사자에게 보이는 사유: ${violationNotice(ctx.reason, ctx.note)}` : null;
  const withNotice = (lines: string[]) => (notice ? [...lines, notice] : lines);
  switch (action) {
    case "hide_job":
      return {
        title: name ? `'${name}' 공고를 숨길까요?` : "공고를 숨길까요?",
        lines: withNotice([
          "공고 숨김 · 남은 지원 미선택 · 답을 기다리던 제안 마감",
          "이미 선택한 지원·수락한 제안은 그대로예요(열린 연락처는 상대방 기록에 남아요)",
          "공고 주인에게 사유 알림이 가요",
          "나중에 [다시 보이기]로 되돌릴 수 있지만, 미선택된 지원·마감된 제안은 되돌아오지 않아요",
        ]),
        confirm: "공고 숨김",
      };
    case "unhide_job":
      return {
        title: name ? `'${name}' 공고를 다시 보이게 할까요?` : "공고를 다시 보이게 할까요?",
        lines: [
          "마감일이 남고 인원이 차지 않았으면 모집 중으로, 아니면 마감으로 돌아와요(숨기기 전에 마감이었으면 마감 그대로)",
          "숨길 때 미선택된 지원·마감된 제안은 되돌아오지 않아요",
          "공고 주인에게 '공고가 다시 보여요' 알림이 가요",
          "공고 주인 계정이 활성일 때만 돼요",
        ],
        confirm: "다시 보이기",
      };
    case "suspend":
      return {
        title: name ? `${name} 계정을 정지할까요?` : "계정을 정지할까요?",
        lines: withNotice([
          "앱을 쓸 수 없고 공개 화면(공고·이력서)에서 빠져요",
          "데이터는 그대로 두고, 다시 활성으로 되돌리면 전부 돌아와요",
          "당사자에게 사유 알림이 가요",
        ]),
        confirm: "정지",
      };
    case "ban":
      return {
        title: name ? `${name} 계정을 퇴출할까요?` : "계정을 퇴출할까요?",
        lines: withNotice([
          "모집 중 공고 숨김 · 남은 지원 미선택 · 보낸/받은 제안 마감 · 계정 차단",
          "당사자에게는 계정 알림 하나만 가요(상대방에게는 마감·미선택 알림이 가요)",
          "나중에 다시 활성으로 바꿔도 마감된 지원·제안은 되돌아오지 않고, 숨긴 공고는 [다시 보이기]로 하나씩만 돌아와요",
        ]),
        confirm: "퇴출",
      };
    case "reactivate":
      return {
        title: name ? `${name} 계정을 다시 활성으로 바꿀까요?` : "계정을 다시 활성으로 바꿀까요?",
        lines: [
          "앱을 다시 쓸 수 있어요",
          ctx.fromStatus === "banned"
            ? "퇴출 때 숨긴 공고·마감된 지원·제안은 되돌아오지 않아요(공고는 공고 탭·신고 탭의 [다시 보이기]로 하나씩)"
            : ctx.fromStatus === "suspended"
              ? "정지 동안 지운 것은 없어요 · 공고·이력서가 다시 공개돼요"
              : "퇴출이었다면 숨긴 공고·마감된 지원·제안은 되돌아오지 않아요",
          "당사자에게 '이용이 다시 가능해졌어요' 알림이 가요",
        ],
        confirm: "다시 활성",
      };
    case "resolve":
      return {
        title: "신고를 '조치함'으로 닫을까요?",
        lines: ["신고한 사람·대상자에게는 알림이 가지 않아요", "처리 메모는 관리자 기록에만 남아요"],
        confirm: "처리 완료",
      };
    case "dismiss":
      return {
        title: "신고를 기각할까요?",
        lines: ["위반이 아니라고 보고 닫아요", "신고한 사람·대상자에게는 알림이 가지 않아요", "처리 메모는 관리자 기록에만 남아요"],
        confirm: "기각",
      };
  }
}

// ---------- 어떤 버튼을 보일지(안내용 — 최종 판단은 서버) ----------

/** 이 계정에 조치 버튼을 보일지: 나 자신 · 관리자 계정은 숨긴다(서버도 42501로 막는다) */
export function canActOnAccount(
  target: { id: string | null; roles?: readonly string[] | null; isAdmin?: boolean },
  adminId: string | null,
): boolean {
  if (!target.id || !adminId) return false;
  if (target.id === adminId) return false;
  if (target.isAdmin || target.roles?.includes("admin")) return false;
  return true;
}

/** 공고 다시 보이기 버튼: 숨긴 공고 · 내 공고 아님 · 관리자 계정의 공고 아님(서버가 최종 관문) */
export function canUnhideJob(
  job: { status: string | null | undefined; ownerId: string | null; ownerIsAdmin?: boolean },
  adminId: string | null,
): boolean {
  if (job.status !== "hidden" || !adminId) return false;
  if (job.ownerId === adminId || job.ownerIsAdmin) return false;
  return true;
}

/** 다시 보이기 결과(서버가 돌려준 저장 상태) → 안내 */
export function unhideDoneText(status: string | null | undefined): string {
  return status === "open" ? "공고를 다시 보이게 했어요 · 모집 중" : "공고를 다시 보이게 했어요 · 마감 상태";
}

/** 네트워크 오류 안내인지(창을 닫지 않고 입력을 지킨 채 다시 누르게 한다) */
export function isNetworkErrorText(msg: string | null | undefined): boolean {
  return !!msg && msg.startsWith("네트워크 연결을 확인");
}

/** 현재 상태에서 할 수 있는 계정 조치(같은 상태로는 못 바꾼다) */
export function accountActionsFor(status: AccountStatusValue | null | undefined): ("suspend" | "ban" | "reactivate")[] {
  switch (status) {
    case "active":
      return ["suspend", "ban"];
    case "suspended":
      return ["ban", "reactivate"];
    case "banned":
      return ["reactivate"];
    default:
      return [];
  }
}

/** 계정 조치 → admin_set_account_status의 p_status */
export function accountStatusFor(action: "suspend" | "ban" | "reactivate"): AccountStatusValue {
  return action === "suspend" ? "suspended" : action === "ban" ? "banned" : "active";
}

/** 공고 숨김 버튼: 공고가 남아 있고 아직 숨김이 아닐 때만 */
export function canHideJob(jobStatus: JobStatusValue | null | undefined): boolean {
  return !!jobStatus && jobStatus !== "hidden";
}

// ---------- 차단 화면 ----------

/** 서버(010 aqua_action_reason_text)가 사유를 붙일 때 쓰는 머리말 */
const REASON_PREFIX = "사유:";

/**
 * 계정 정지·퇴출 알림 본문 → 당사자에게 보여 줄 사유. 사유가 없으면 null(중립 문구로 대신).
 * 본문 모양: '사유: 허위 공고' | '사유: 기타 · …' | '자세한 내용은 앱에서 확인해 주세요'.
 */
export function blockedReasonFromBody(body: string | null | undefined): string | null {
  const b = (body ?? "").trim();
  if (!b.startsWith(REASON_PREFIX)) return null;
  const r = b.slice(REASON_PREFIX.length).trim();
  return r.length > 0 ? r : null;
}

/** 차단 화면에서 찾을 알림 종류(현재 계정 상태와 같은 것) */
export function blockedNotificationKind(status: AccountStatusValue | null | undefined): "account_suspended" | "account_banned" | null {
  if (status === "suspended") return "account_suspended";
  if (status === "banned") return "account_banned";
  return null;
}

export const BLOCKED_TITLE: Record<"suspended" | "banned", string> = {
  suspended: "계정 이용이 일시 정지됐어요",
  banned: "계정 이용이 중지됐어요",
};

/** ISO 시각 → 한국 시각 'M/D HH:MM' */
export function formatKstDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const t = new Date(ms + 9 * 3600e3).toISOString();
  return `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))} ${t.slice(11, 16)}`;
}
