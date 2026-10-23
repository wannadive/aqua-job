"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listAllJobsForAdmin } from "@/lib/jobs/api";
import { filterAdminJobs, type AdminJobFilter, type AdminJobRow } from "@/lib/jobs/admin";
import { ModerationActionDialog, type ActionRequest } from "@/components/moderation/action-dialog";
import { canUnhideJob } from "@/lib/moderation/logic";
import { JobCard } from "../job-card";

const FILTERS: { key: AdminJobFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "open", label: "모집중" },
  { key: "closed", label: "마감" },
];

/**
 * 관리자 공고 목록. 숨긴 공고에는 [다시 보이기](012 admin_unhide_job — 서버가 관리자·주인 활성·관리자 공고 아님을 확인).
 * 숨김·신고 처리는 신고 탭에서.
 */
export function AdminJobs({ adminId = null }: { adminId?: string | null } = {}) {
  const [rows, setRows] = useState<AdminJobRow[] | null>(null);
  const [action, setAction] = useState<(ActionRequest & { key: number }) | null>(null);
  const seq = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 다시 보이기 뒤: 공고 목록만 다시 읽는다
  const reload = useCallback(async () => {
    try {
      const l = await listAllJobsForAdmin();
      if (alive.current) setRows(l);
    } catch {
      if (alive.current) toast.error("공고 목록을 새로 불러오지 못했어요");
    }
  }, []);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<AdminJobFilter>("all");

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    listAllJobsForAdmin()
      .then((l) => !cancelled && setRows(l))
      .catch(() => {
        if (!cancelled) {
          toast.error("공고 목록을 불러오지 못했어요");
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const visible = useMemo(() => (rows ? filterAdminJobs(rows, filter) : []), [rows, filter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">공고</h1>
        <p className="mt-1 text-sm text-muted">{rows ? `${visible.length}건 · 최신순` : "공고 목록"}</p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${filter === f.key ? "bg-ink text-white" : "bg-white text-ink shadow-sm"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <div className="rounded-card bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-muted">공고 목록을 불러오지 못했어요</p>
          <Button variant="outline" className="mt-3 h-12" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </Button>
        </div>
      ) : !rows ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">공고가 없어요</p>
      ) : (
        visible.map((r) => (
          <JobCard
            key={r.job.id}
            job={r.job}
            showStatus
            dimmed={r.job.status !== "open"}
            extra={
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">
                  {r.applied}명 지원 · 선택·수락 {r.selected + r.acceptedOffers}/{r.job.headcount}
                </span>
                {canUnhideJob({ status: r.job.status, ownerId: r.job.ownerId }, adminId) && (
                  <Button
                    variant="outline"
                    className="h-10 border-line px-4 text-sm"
                    onClick={() =>
                      setAction({ action: "unhide_job", targetId: r.job.id, targetName: r.job.title, key: ++seq.current })
                    }
                  >
                    다시 보이기
                  </Button>
                )}
              </span>
            }
          />
        ))
      )}
      {action && (
        <ModerationActionDialog key={action.key} request={action} onClose={() => setAction(null)} onDone={reload} />
      )}
    </div>
  );
}
