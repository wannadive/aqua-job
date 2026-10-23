"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchMyApplicantCounts, listMyJobs } from "@/lib/jobs/api";
import type { JobSummary } from "@/lib/jobs/types";

export type ApplicantCounts = Map<string, { applied: number; selected: number; total: number }>;

/** 센터의 내 공고 + 공고별 지원 수. 한 번만 불러 홈 현황·공고 탭이 같이 쓴다. */
export function useMyJobs() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [counts, setCounts] = useState<ApplicantCounts>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setError(false);
    try {
      const res = await listMyJobs();
      const c = await fetchMyApplicantCounts(res.jobs.map((j) => j.id));
      if (my !== seq.current) return;
      setJobs(res.jobs);
      setCounts(c);
      if (res.failed > 0) toast.error(`공고 ${res.failed}개를 불러오지 못했어요. 새로고침해 보세요`);
    } catch {
      if (my === seq.current) setError(true);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { jobs, counts, loading, error, reload };
}

export function summarize(jobs: JobSummary[], counts: ApplicantCounts) {
  let applied = 0;
  let total = 0;
  for (const c of counts.values()) {
    applied += c.applied;
    total += c.total;
  }
  return { open: jobs.filter((j) => j.status === "open").length, applied, total };
}
