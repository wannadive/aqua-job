import type { ApplicationStatus, JobStatus } from "./types.ts";

/** 센터 지원자 화면의 순수 규칙. 연락처는 다루지 않는다(연락처는 get_applicant_contact 결과를 화면 한 곳에서만). */

export interface ApplicantLike {
  id: string;
  jobId: string;
  status: ApplicationStatus;
}

/** 이 공고에서 선택된 지원자 수 */
export function selectedCountFor(apps: { jobId: string; status: ApplicationStatus }[], jobId: string): number {
  let n = 0;
  for (const a of apps) if (a.jobId === jobId && a.status === "selected") n += 1;
  return n;
}

/** [선택하기]를 보여 줄지: 지원함 상태 + 공고 진행중 + 남은 자리 있음. 최종 판단은 select_applicant(서버)가 한다. */
export function canSelect(
  app: { status: ApplicationStatus },
  job: { status: JobStatus; headcount: number } | null | undefined,
  selectedCount: number,
): boolean {
  if (!job) return false;
  return app.status === "applied" && job.status === "open" && selectedCount < job.headcount;
}

/** 선택 수가 모집 인원에 닿았는가(선택 뒤 마감 안내용) */
export function isJobFull(job: { headcount: number }, selectedCount: number): boolean {
  return selectedCount >= job.headcount;
}

/**
 * 공고 필터(null = 전체). 취소한 지원은 항상 뺀다 — 007부터 RLS가 공고 주인에게 취소 행을 주지 않지만
 * 화면에서도 한 번 더 거른다. 순서는 그대로.
 */
export function filterApplicants<T extends ApplicantLike>(apps: T[], opts: { jobId: string | null }): T[] {
  return apps.filter((a) => (opts.jobId === null || a.jobId === opts.jobId) && a.status !== "withdrawn");
}

/** ISO 시각 → KST "M/D HH:MM" */
export function formatAppliedAt(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const t = new Date(ms + 9 * 3600e3).toISOString();
  return `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))} ${t.slice(11, 16)}`;
}
