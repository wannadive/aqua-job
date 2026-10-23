"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchAccountRoles, listAdminReports } from "@/lib/moderation/api";
import {
  ACCOUNT_STATUS_LABEL,
  REPORT_STATUS_LABEL,
  TARGET_TYPE_LABEL,
  accountActionsFor,
  canActOnAccount,
  canHideJob,
  formatKstDateTime,
  violationLabel,
} from "@/lib/moderation/logic";
import type { AdminReport, JobStatusValue, ReportStatus } from "@/lib/moderation/types";
import { ModerationActionDialog, type ActionRequest } from "./action-dialog";
import { ResolveReportDialog, type ResolveRequest } from "./resolve-dialog";

const FILTERS: { key: ReportStatus; label: string }[] = [
  { key: "open", label: "처리 전" },
  { key: "resolved", label: "조치함" },
  { key: "dismissed", label: "기각" },
];

const JOB_STATUS_TEXT: Record<JobStatusValue, string> = {
  open: "진행중",
  full: "모집 완료",
  expired: "기간 지남",
  closed: "마감",
  hidden: "숨김",
};

const PAGE = 200;

type Roles = { state: "loading" } | { state: "error" } | { state: "ok"; byId: Map<string, string[]> };

/**
 * 관리자 [신고] 탭. 관리자 역할 화면에서만 그린다(셸이 정한다) — 권한은 서버(admin_list_reports 등, is_admin)가 확인한다.
 * 이 화면을 떠나거나(역할 전환·로그아웃) 계정이 바뀌면 컴포넌트가 사라지며 목록도 함께 버려진다.
 */
export function AdminReports({ adminId }: { adminId: string }) {
  const [filter, setFilter] = useState<ReportStatus>("open");
  const [rows, setRows] = useState<AdminReport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Roles>({ state: "loading" });
  const [action, setAction] = useState<(ActionRequest & { key: number }) | null>(null);
  const [resolving, setResolving] = useState<(ResolveRequest & { key: number }) | null>(null);
  const reqSeq = useRef(0);
  const dialogSeq = useRef(0);

  // 가장 최근 요청 결과만 반영(필터를 빨리 바꿔도 앞 요청이 덮어쓰지 않게)
  const load = useCallback(async (status: ReportStatus) => {
    const seq = ++reqSeq.current;
    setLoadError(null);
    try {
      const list = await listAdminReports(status, PAGE);
      if (seq !== reqSeq.current) return;
      setRows(list);
      // 관리자 계정 · 나 자신에게는 조치 버튼을 숨기려고 대상 계정 역할을 읽는다(서버도 막는다)
      setRoles({ state: "loading" });
      try {
        const byId = await fetchAccountRoles(list.map((r) => r.targetUserId ?? "").filter(Boolean));
        if (seq === reqSeq.current) setRoles({ state: "ok", byId });
      } catch {
        if (seq === reqSeq.current) setRoles({ state: "error" });
      }
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setLoadError(e instanceof Error ? e.message : "신고 목록을 불러오지 못했어요");
    }
  }, []);

  useEffect(() => {
    setRows(null);
    void load(filter);
    return () => {
      // 화면을 떠나면 늦게 온 응답을 버린다
      reqSeq.current++;
    };
  }, [filter, load]);

  const reload = useCallback(() => load(filter), [load, filter]);

  const openAction = (req: ActionRequest) => setAction({ ...req, key: ++dialogSeq.current });
  const openResolve = (req: ResolveRequest) => setResolving({ ...req, key: ++dialogSeq.current });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">신고</h1>
        <p className="mt-1 text-sm text-muted">규칙 위반 신고만 다뤄요 · 최근 순</p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`h-10 rounded-full px-4 text-sm font-semibold ${filter === f.key ? "bg-ink text-white" : "bg-white text-muted shadow-sm"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <div className="rounded-card bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-muted">{loadError}</p>
          <Button variant="outline" className="mt-3 h-12" onClick={() => void reload()}>
            다시 시도
          </Button>
        </div>
      ) : !rows ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-card bg-white p-6 text-center text-sm text-muted shadow-sm">
          {filter === "open" ? "처리할 신고가 없어요" : "해당하는 신고가 없어요"}
        </div>
      ) : (
        <>
          {roles.state === "error" && (
            <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn">
              대상 계정 정보를 불러오지 못해 조치 버튼을 숨겼어요.
              <button type="button" onClick={() => void reload()} className="ml-2 font-semibold underline">
                다시 시도
              </button>
            </p>
          )}
          <ul className="space-y-3">
            {rows.map((r) => (
              <ReportCard key={r.id} report={r} roles={roles} adminId={adminId} onAction={openAction} onResolve={openResolve} />
            ))}
          </ul>
          {rows.length >= PAGE && <p className="text-center text-xs text-muted">최근 {PAGE}건까지 보여요</p>}
        </>
      )}

      {action && (
        <ModerationActionDialog key={action.key} request={action} onClose={() => setAction(null)} onDone={reload} />
      )}
      {resolving && (
        <ResolveReportDialog key={resolving.key} request={resolving} onClose={() => setResolving(null)} onDone={reload} />
      )}
    </div>
  );
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "ok" }) {
  const cls = tone === "warn" ? "bg-warn-bg text-warn" : tone === "ok" ? "bg-ok-bg text-ok" : "bg-surface text-muted";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function ReportCard({
  report: r,
  roles,
  adminId,
  onAction,
  onResolve,
}: {
  report: AdminReport;
  roles: Roles;
  adminId: string;
  onAction: (req: ActionRequest) => void;
  onResolve: (req: ResolveRequest) => void;
}) {
  const title = r.targetTitle ?? (r.targetType === "job" ? "(지워진 공고)" : "(이름 없음)");
  const targetRoles = roles.state === "ok" && r.targetUserId ? (roles.byId.get(r.targetUserId) ?? null) : null;
  // 역할을 확인한 대상만 조치 버튼(관리자 계정·나 자신은 숨김). 확인 못 하면 숨긴다 — 서버가 최종 관문.
  const actionable = roles.state === "ok" && targetRoles !== null && canActOnAccount({ id: r.targetUserId, roles: targetRoles }, adminId);
  const protectedTarget = roles.state === "ok" && r.targetUserId !== null && !actionable;
  const isOpen = r.status === "open";
  const reportRef = { id: r.id, targetType: r.targetType, targetId: r.targetId, openCount: r.targetOpenReports };
  const accountActions = r.targetType === "job" ? [] : accountActionsFor(r.targetAccountStatus).filter((a) => a !== "reactivate");

  return (
    <li className="rounded-card bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{TARGET_TYPE_LABEL[r.targetType]}</Chip>
        {r.targetJobStatus && <Chip tone={r.targetJobStatus === "hidden" ? "warn" : "muted"}>공고 {JOB_STATUS_TEXT[r.targetJobStatus]}</Chip>}
        {r.targetAccountStatus && (
          <Chip tone={r.targetAccountStatus === "active" ? "ok" : "warn"}>계정 {ACCOUNT_STATUS_LABEL[r.targetAccountStatus]}</Chip>
        )}
        {r.targetOpenReports > 0 && <Chip tone="warn">같은 대상 열린 신고 {r.targetOpenReports}건</Chip>}
      </div>
      <p className="mt-3 break-words text-base font-bold text-ink">{title}</p>
      {r.targetType === "job" && r.targetCenterName && <p className="mt-0.5 break-words text-sm text-muted">{r.targetCenterName}</p>}

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-muted">사유</dt>
          <dd className="min-w-0 flex-1 font-semibold text-ink">{violationLabel(r.reason)}</dd>
        </div>
        {r.note && (
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-muted">설명</dt>
            <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">{r.note}</dd>
          </div>
        )}
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-muted">신고</dt>
          <dd className="min-w-0 flex-1 break-words text-ink">
            {formatKstDateTime(r.createdAt)} · {r.reporterName ?? "(이름 없음)"}
          </dd>
        </div>
        {!isOpen && (
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-muted">처리</dt>
            <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">
              {REPORT_STATUS_LABEL[r.status]}
              {r.resolvedAt ? ` · ${formatKstDateTime(r.resolvedAt)}` : ""}
              {r.resolution ? `\n${r.resolution}` : ""}
            </dd>
          </div>
        )}
      </dl>

      {isOpen && (
        <div className="mt-4 space-y-2">
          {protectedTarget && <p className="text-xs text-muted">관리자 계정 · 내 계정이 대상이라 조치 버튼이 없어요</p>}
          {actionable && (
            <div className="flex flex-wrap gap-2">
              {r.targetType === "job" && canHideJob(r.targetJobStatus) && (
                <Button
                  variant="outline"
                  className="h-11 border-line"
                  onClick={() => onAction({ action: "hide_job", targetId: r.targetId, targetName: title, report: reportRef })}
                >
                  공고 숨김
                </Button>
              )}
              {r.targetUserId &&
                accountActions.map((a) => (
                  <Button
                    key={a}
                    variant="outline"
                    className={`h-11 border-line ${a === "ban" ? "text-warn" : ""}`}
                    onClick={() =>
                      onAction({ action: a, targetId: r.targetUserId as string, targetName: title, report: reportRef })
                    }
                  >
                    {a === "suspend" ? "정지" : "퇴출"}
                  </Button>
                ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-11 bg-ink text-white" onClick={() => onResolve({ reportId: r.id, status: "resolved" })}>
              처리 완료
            </Button>
            <Button variant="outline" className="h-11 border-line" onClick={() => onResolve({ reportId: r.id, status: "dismissed" })}>
              기각
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
