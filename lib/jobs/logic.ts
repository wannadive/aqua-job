import { PAY_UNITS } from "./config.ts";
import type { DocType } from "../verification/types.ts";
import type { JobStatus, JobSummary, JobType, PayUnit, RequirementRule } from "./types.ts";

/** 단가 표시. 미입력은 "협의". */
export function formatPay(amount: number | null, unit: PayUnit | null): string {
  if (amount == null || unit == null) return "협의";
  return `${PAY_UNITS[unit]} ${amount.toLocaleString("en-US")}원`;
}

/** SQL job_effective_status 입력(저장 상태 + 날짜 + 선택 수). today는 KST YYYY-MM-DD. */
export interface JobStatusInput {
  storedStatus: "open" | "closed" | "hidden";
  closedReason: "manual" | "full" | "expired" | null;
  jobType: JobType;
  deadline: string;
  classDate: string | null;
  tourStart: string | null;
  headcount: number;
  selectedCount: number;
}

/** SQL job_effective_status와 같은 규칙: hidden > closed(사유별) > 날짜 지남 > 인원 참 > open */
export function jobDisplayStatus(j: JobStatusInput, today: string): JobStatus {
  if (j.storedStatus === "hidden") return "hidden";
  if (j.storedStatus === "closed") {
    if (j.closedReason === "full") return "full";
    if (j.closedReason === "expired") return "expired";
    return "closed";
  }
  if (
    today > j.deadline ||
    (j.jobType === "lesson" && j.classDate != null && today > j.classDate) ||
    (j.jobType === "tour" && j.tourStart != null && today > j.tourStart)
  ) {
    return "expired";
  }
  if (j.selectedCount >= j.headcount) return "full";
  return "open";
}

export function remainingSlots(headcount: number, selected: number): number {
  return Math.max(headcount - selected, 0);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** YYYY-MM-DD → "M/D(요일)" (달력 계산만, 시간대 변환 없음) */
export function formatMdWeekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}(${WEEKDAYS[wd]})`;
}

/** ISO 시각 → KST "M/D" */
export function formatMdKst(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const t = new Date(ms + 9 * 3600e3).toISOString();
  return `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))}`;
}

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

type DatesInput = Pick<
  JobSummary,
  | "jobType"
  | "classDate"
  | "startTime"
  | "endTime"
  | "workDays"
  | "workTime"
  | "tourStart"
  | "tourEnd"
  | "destination"
  | "destinationKind"
>;

export function formatJobDates(j: DatesInput): string {
  if (j.jobType === "lesson") {
    if (!j.classDate) return "";
    const date = formatMdWeekday(j.classDate);
    const s = hhmm(j.startTime);
    const e = hhmm(j.endTime);
    if (s && e) return `${date} ${s}–${e}`;
    if (s) return `${date} ${s}~`;
    return date;
  }
  if (j.jobType === "affiliation") {
    return [j.workDays.join("·"), j.workTime].filter((x) => x && x.length > 0).join(" ");
  }
  if (!j.tourStart || !j.tourEnd) return "";
  const range = `${formatMdWeekday(j.tourStart)}~${formatMdWeekday(j.tourEnd)}`;
  if (!j.destination) return range;
  const kind = j.destinationKind === "overseas" ? "(해외)" : j.destinationKind === "domestic" ? "(국내)" : "";
  return `${range} · ${j.destination}${kind}`;
}

/** "10/21 등록 · 조회 128", 수정했으면 "10/21 등록 · 10/22 수정됨 · 조회 128" */
export function metaLine(createdAt: string, editedAt: string | null, views: number): string {
  const parts = [`${formatMdKst(createdAt)} 등록`];
  if (editedAt) parts.push(`${formatMdKst(editedAt)} 수정됨`);
  parts.push(`조회 ${views}`);
  return parts.join(" · ");
}

/** 이 종류의 공고를 올리는 데 필요한데 아직 확인되지 않은 서류(verification_requirements 기준) */
export function missingForJobType(
  verifiedTypes: DocType[],
  rules: RequirementRule[],
  jobType: JobType,
): DocType[] {
  const action = `post_${jobType}`;
  const out: DocType[] = [];
  for (const r of rules) {
    if (r.action === action && !verifiedTypes.includes(r.docType) && !out.includes(r.docType)) out.push(r.docType);
  }
  return out;
}

/** YYYY-MM-DD에 일수를 더한다(UTC 달력 계산). */
export function addDaysYmd(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 마감일 기본값. 수업=수업 전날, 투어=출발 7일 전(오늘보다 앞서지 않게), 소속=오늘+14일. 날짜가 비면 오늘+14일. */
export function defaultDeadline(
  type: JobType,
  dates: { classDate?: string | null; tourStart?: string | null },
  today: string,
): string {
  if (type === "lesson" && dates.classDate) {
    const d = addDaysYmd(dates.classDate, -1);
    return d < today ? today : d;
  }
  if (type === "tour" && dates.tourStart) {
    const d = addDaysYmd(dates.tourStart, -7);
    return d < today ? today : d;
  }
  return addDaysYmd(today, 14);
}

/** 지원 목록 → 공고별 지원 수(지원 취소 제외), 대기(applied), 선택 수 */
export function countApplications(
  rows: { jobId: string; status: string }[],
): Map<string, { applied: number; selected: number; total: number }> {
  const out = new Map<string, { applied: number; selected: number; total: number }>();
  for (const r of rows) {
    if (r.status === "withdrawn") continue;
    const c = out.get(r.jobId) ?? { applied: 0, selected: 0, total: 0 };
    c.total += 1;
    if (r.status === "applied") c.applied += 1;
    if (r.status === "selected") c.selected += 1;
    out.set(r.jobId, c);
  }
  return out;
}

const HANGUL = /[가-힣]/;

/** RPC 오류 → 사용자용 한국어 문구. SQL이 한국어 메시지를 주면 그대로 쓴다. */
export function jobErrorMessage(err: { code?: string | null; message?: string | null } | null | undefined): string {
  const msg = err?.message ?? "";
  const korean = HANGUL.test(msg) ? msg : null;
  switch (err?.code) {
    case "22023":
      return korean ?? "입력한 내용을 확인해 주세요";
    case "42501":
      return korean ?? "이 작업을 할 권한이 없어요";
    case "P0002":
      return korean ?? "찾을 수 없어요";
    case "23505":
      return korean ?? "이미 처리된 요청이에요";
    case "22P02":
    case "22007":
    case "22008":
      return "입력한 값의 형식을 확인해 주세요(숫자·날짜)";
    default:
      return "잠시 후 다시 시도해 주세요";
  }
}

/** 목록 정렬: 진행중 공고를 먼저, 그 밖(마감·기간 지남·모집 완료)은 뒤로. 각 묶음 안의 순서(서버 순서)는 유지. */
export function sortOpenFirst<T extends { status: JobStatus }>(jobs: T[]): T[] {
  return [...jobs.filter((j) => j.status === "open"), ...jobs.filter((j) => j.status !== "open")];
}
