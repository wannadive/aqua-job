import { jobDisplayStatus, remainingSlots } from "./logic.ts";
import { jobSummaryFromRow } from "./mappers.ts";
import type { JobSummary } from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AdminJobRow {
  job: JobSummary;
  /** 취소(withdrawn)를 뺀 지원 수 */
  applied: number;
  selected: number;
  /** 수락한 제안 수(009) */
  acceptedOffers: number;
}

export type AdminJobFilter = "all" | "open" | "closed";

/**
 * 관리자 공고 목록. job_posts 원본 행 + 지원 상태 행 + 센터 이름 → 화면용 행(최신순).
 * 유효 상태는 SQL job_effective_status와 같은 규칙(jobDisplayStatus)으로 계산한다. today는 KST YYYY-MM-DD.
 */
export function buildAdminJobRows(
  posts: any[],
  apps: { job_id: string; status: string }[],
  centers: { id: string; name: string | null }[],
  today: string,
  /** 제안 상태 행(009). 채운 인원 = 선택한 지원 + 수락한 제안(SQL job_filled_count) */
  offers: { job_id: string; status: string }[] = [],
): AdminJobRow[] {
  const accepted = new Map<string, number>();
  for (const o of offers) {
    if (o.status === "accepted") accepted.set(o.job_id, (accepted.get(o.job_id) ?? 0) + 1);
  }
  const nameById = new Map(centers.map((c) => [c.id, c.name ?? ""]));
  const counts = new Map<string, { applied: number; selected: number }>();
  for (const a of apps) {
    if (a.status === "withdrawn") continue;
    const c = counts.get(a.job_id) ?? { applied: 0, selected: 0 };
    c.applied += 1;
    if (a.status === "selected") c.selected += 1;
    counts.set(a.job_id, c);
  }
  const rows = posts.map((p) => {
    const c = counts.get(p.id) ?? { applied: 0, selected: 0 };
    const acc = accepted.get(p.id) ?? 0;
    const filled = c.selected + acc;
    const status = jobDisplayStatus(
      {
        storedStatus: p.status,
        closedReason: p.closed_reason ?? null,
        jobType: p.job_type,
        deadline: p.deadline,
        classDate: p.class_date ?? null,
        tourStart: p.tour_start ?? null,
        headcount: p.headcount,
        selectedCount: filled,
      },
      today,
    );
    const job = jobSummaryFromRow({
      ...p,
      center_name: nameById.get(p.center_id) || "센터",
      remaining: remainingSlots(p.headcount, filled),
      effective_status: status,
    });
    return { job, applied: c.applied, selected: c.selected, acceptedOffers: acc };
  });
  return rows.sort((a, b) => (a.job.createdAt < b.job.createdAt ? 1 : a.job.createdAt > b.job.createdAt ? -1 : 0));
}

/** 모집중 = 유효 상태 open, 마감 = 그 밖(모집 완료·기간 지남·마감·숨김) */
export function filterAdminJobs(rows: AdminJobRow[], f: AdminJobFilter): AdminJobRow[] {
  if (f === "all") return rows;
  return rows.filter((r) => (f === "open") === (r.job.status === "open"));
}
