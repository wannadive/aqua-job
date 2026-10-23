"use client";

import { useEffect, useState } from "react";
import { listPublicJobs } from "@/lib/jobs/api";
import { sortOpenFirst } from "@/lib/jobs/logic";
import type { JobSummary } from "@/lib/jobs/types";
import { EMPTY_FILTERS, JobFilters, type JobFilterState } from "./job-filters";
import { JobCard } from "./job-card";

/** 공개 공고 목록. 서버(list_public_jobs)가 돌려준 요약만 쓴다. */
export function JobList({ onOpenJob }: { onOpenJob: (job: JobSummary) => void }) {
  const [filters, setFilters] = useState<JobFilterState>(EMPTY_FILTERS);
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setJobs(null);
    setError(false);
    listPublicJobs({ type: filters.type, region: filters.region, paidOnly: filters.paidOnly })
      .then((list) => !cancelled && setJobs(sortOpenFirst(list)))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [filters, attempt]);

  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">공고</h1>
      <JobFilters value={filters} onChange={setFilters} />
      {error ? (
        <div className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
          공고를 불러오지 못했어요
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="ml-3 font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      ) : jobs === null ? (
        <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>
      ) : jobs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">조건에 맞는 공고가 없어요</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} showStatus maxTags={2} dimmed={j.status !== "open"} onOpen={() => onOpenJob(j)} />
          ))}
        </div>
      )}
    </div>
  );
}
