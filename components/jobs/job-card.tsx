import type { ReactNode } from "react";
import { JOB_TYPES } from "@/lib/jobs/config";
import { formatJobDates, formatPay, metaLine } from "@/lib/jobs/logic";
import type { JobStatus, JobSummary } from "@/lib/jobs/types";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  open: "진행중",
  full: "모집 완료",
  expired: "기간 지남",
  closed: "마감",
  hidden: "숨김",
};

/** 공고 카드. 강사가 보는 모양 그대로(센터 미리보기·내 공고 목록·강사 목록에서 같이 쓴다). */
export function JobCard({
  job,
  showStatus = false,
  extra,
  children,
  dimmed = false,
  maxTags,
  onOpen,
}: {
  job: JobSummary;
  /** 상태 꼬리표(내 공고 화면용) */
  showStatus?: boolean;
  /** 메타 줄 위에 한 줄 더(예: `3명 지원 · 선택 1/2`) */
  extra?: ReactNode;
  /** 카드 아래 버튼 영역 */
  children?: ReactNode;
  /** 마감·기간 지남 공고를 흐리게 */
  dimmed?: boolean;
  /** 자격 꼬리표 최대 개수(목록은 2) */
  maxTags?: number;
  /** 주면 카드 전체가 눌러 열린다(상세로) */
  onOpen?: () => void;
}) {
  const dates = formatJobDates(job);
  const tags = maxTags == null ? job.requirementTags : job.requirementTags.slice(0, maxTags);
  return (
    <article
      className={`rounded-card bg-white p-5 shadow-sm ${dimmed ? "opacity-60" : ""} ${onOpen ? "cursor-pointer" : ""}`}
      onClick={onOpen}
      {...(onOpen
        ? {
            role: "link",
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
            },
          }
        : {})}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">{JOB_TYPES[job.jobType].short}</span>
        {showStatus && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${job.status === "open" ? "bg-ok-bg text-ok" : "bg-surface text-muted"}`}
          >
            {JOB_STATUS_LABEL[job.status]}
          </span>
        )}
      </div>
      <h3 className="mt-2 text-lg font-bold leading-snug text-ink">{job.title}</h3>
      <p className="mt-0.5 text-sm text-muted">
        {job.centerName} · {job.region}
        {job.venue ? ` · ${job.venue}` : ""}
      </p>
      {dates && <p className="mt-2 text-sm font-medium text-ink">{dates}</p>}
      <p className="mt-1 text-sm font-semibold text-ink">{formatPay(job.payAmount, job.payUnit)}</p>
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink">
              {t}
            </span>
          ))}
        </div>
      )}
      {extra && <p className="mt-3 text-sm font-semibold text-ink">{extra}</p>}
      <p className="mt-2 text-xs text-muted">{metaLine(job.createdAt, job.editedAt, job.viewCount)}</p>
      {children && <div className="mt-4">{children}</div>}
    </article>
  );
}
