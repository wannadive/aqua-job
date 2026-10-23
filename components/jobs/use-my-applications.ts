"use client";

import { useCallback, useEffect, useState } from "react";
import { listMyApplications } from "@/lib/jobs/api";
import type { MyApplication } from "@/lib/jobs/types";

/** 내 지원 목록(홈 숫자·지원 현황 탭이 함께 쓴다). reload는 지원·취소 뒤에 부른다. */
export function useMyApplications() {
  const [apps, setApps] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await listMyApplications();
      setApps(list);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { apps, loading, error, reload };
}
