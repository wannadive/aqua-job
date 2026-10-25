"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  adminHideJob,
  adminResolveReport,
  adminSetAccountStatus,
  adminUnhideJob,
  resolveOpenReportsForTarget,
} from "@/lib/moderation/api";
import {
  NOTE_MAX,
  accountStatusFor,
  charCount,
  confirmText,
  isNetworkErrorText,
  memoInputError,
  noteVisibilityHint,
  unhideDoneText,
  violationInputError,
  violationLabel,
} from "@/lib/moderation/logic";
import type { AccountStatusValue, ReportTargetType, ViolationReason } from "@/lib/moderation/types";
import { ViolationFields } from "./violation-fields";
import { isDirty } from "@/lib/navigation/dirty";
import { useLeaveGuard } from "@/lib/navigation/use-navigable";

export type AdminAction = "hide_job" | "unhide_job" | "suspend" | "ban" | "reactivate";

export interface ActionRequest {
  action: AdminAction;
  /** hide_job · unhide_job = 공고 id, 그 밖 = 회원 id */
  targetId: string;
  targetName: string;
  /** 계정 조치 전 상태(다시 활성 확인 문구가 정지/퇴출에 따라 다르다) */
  fromStatus?: AccountStatusValue | null;
  /** 신고에서 연 조치면 그 신고(조치 뒤 신고를 닫을지 고른다) */
  report?: { id: string; targetType: ReportTargetType; targetId: string; openCount: number } | null;
}

type CloseScope = "this" | "all" | "none";

const DONE_TEXT: Record<AdminAction, string> = {
  hide_job: "공고를 숨겼어요",
  unhide_job: "공고를 다시 보이게 했어요",
  suspend: "계정을 정지했어요",
  ban: "계정을 퇴출했어요",
  reactivate: "계정을 다시 활성으로 바꿨어요",
};

// 서버가 입력을 되돌려 보낸 경우(창을 열어 둔 채 고치게 한다)
const INPUT_ERROR = /사유를 골라|기타를 고르면|500자/;

/**
 * 관리자 조치 창: 1) 사유·설명 입력 → 2) 무슨 일이 일어나는지 확인 → 실행.
 * 권한·대상 확인은 서버(011)가 한다. 실패하면 목록을 다시 불러온다(이미 숨김·이미 그 상태 등 오래된 화면).
 */
export function ModerationActionDialog({
  request,
  onClose,
  onDone,
}: {
  /** 부르는 쪽이 요청마다 key를 바꿔 새로 만든다(앞 요청의 입력이 남지 않게) */
  request: ActionRequest;
  onClose: () => void;
  /** 조치 뒤 영향받은 목록만 다시 불러오기 */
  onDone: () => Promise<unknown> | void;
}) {
  const report = request.report ?? null;
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [reason, setReason] = useState<ViolationReason | null>(null);
  const [note, setNote] = useState("");
  // 신고에서 열었으면 기본은 신고를 닫는다(같은 대상 열린 신고가 더 있으면 모두)
  const initialScope: CloseScope = report ? (report.openCount > 1 ? "all" : "this") : "none";
  const [scope, setScope] = useState<CloseScope>(initialScope);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  // 작성 중 = 사유·설명·신고 처리 방식을 바꿈. 폰 뒤로가기·취소·바깥 누름 전에 묻는다
  const guard = useLeaveGuard(isDirty({ reason: null, note: "", scope: initialScope }, { reason, note, scope }));
  const close = () => {
    if (busy || !guard.confirmLeave()) return;
    onClose();
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 다시 활성 · 다시 보이기는 위반 사유 없이 메모만(관리자 기록)
  const isReactivate = request.action === "reactivate" || request.action === "unhide_job";
  const ct = confirmText(request.action, {
    targetName: request.targetName,
    reason: isReactivate ? null : reason,
    note,
    fromStatus: request.fromStatus ?? null,
  });

  const next = () => {
    const err = isReactivate ? memoInputError(note) : violationInputError(reason, note);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setStep("confirm");
  };

  const finish = async () => {
    try {
      await onDone();
    } catch {
      /* 다시 불러오기 실패는 목록 화면이 따로 알린다 */
    }
  };

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFormError(null);
    const r = request;
    const rsn = reason;
    let res: { error?: string; status?: string };
    if (r.action === "unhide_job") {
      res = await adminUnhideJob(r.targetId, note);
    } else if (r.action === "hide_job") {
      res = rsn ? await adminHideJob(r.targetId, rsn, note) : { error: "사유를 골라 주세요" };
    } else if (r.action === "reactivate") {
      res = await adminSetAccountStatus(r.targetId, "active", null, note);
    } else {
      res = rsn ? await adminSetAccountStatus(r.targetId, accountStatusFor(r.action), rsn, note) : { error: "사유를 골라 주세요" };
    }

    if (res.error) {
      toast.error(res.error);
      if (!mounted.current) return;
      // 입력 오류는 입력 단계로, 네트워크 오류는 이 단계 그대로 — 둘 다 창을 열어 둔 채 입력을 지킨다
      if (INPUT_ERROR.test(res.error) || isNetworkErrorText(res.error)) {
        setFormError(res.error);
        if (INPUT_ERROR.test(res.error)) setStep("form");
        running.current = false;
        setBusy(false);
        return;
      }
      // 이미 숨김·이미 그 상태·권한 없음 등: 화면이 오래됐을 수 있다 → 영향받은 목록만 다시 불러오고 닫는다
      guard.release();
      await finish();
      if (mounted.current) onClose();
      return;
    }

    toast.success(r.action === "unhide_job" ? unhideDoneText(res.status) : DONE_TEXT[r.action]);
    guard.release(); // 조치했으니 닫을 때 묻지 않는다

    // 신고에서 연 조치면 고른 대로 신고를 닫는다(조용히 열어 두지 않는다)
    if (report && scope !== "none") {
      const memo = `${ct.confirm}${rsn ? ` · ${violationLabel(rsn)}` : ""}`;
      if (scope === "all") {
        try {
          const out = await resolveOpenReportsForTarget({ type: report.targetType, id: report.targetId }, "resolved", memo);
          if (out.failed > 0) toast.error(`조치는 됐지만 신고 ${out.failed}건을 닫지 못했어요. [처리 완료]를 다시 눌러 주세요`);
          else if (out.done > 0) toast.success(`같은 대상 신고 ${out.done}건을 '조치함'으로 닫았어요`);
          else toast("신고는 이미 처리돼 있었어요");
        } catch {
          toast.error("조치는 됐지만 신고를 닫지 못했어요. [처리 완료]를 다시 눌러 주세요");
        }
      } else {
        const rr = await adminResolveReport(report.id, "resolved", memo);
        if (!rr.error) toast.success("신고를 '조치함'으로 닫았어요");
        else if (rr.error.includes("이미 처리된 신고")) toast("신고는 이미 처리돼 있었어요");
        else toast.error("조치는 됐지만 신고를 닫지 못했어요. [처리 완료]를 다시 눌러 주세요");
      }
    } else if (report) {
      toast("신고는 열어 두었어요. 나중에 [처리 완료]나 [기각]으로 닫아 주세요");
    }

    if (!mounted.current) return;
    await finish();
    if (mounted.current) onClose();
  };

  const scopeLine =
    report && scope === "this"
      ? "이 신고를 '조치함'으로 닫아요"
      : report && scope === "all"
        ? `같은 대상의 열린 신고 ${report.openCount}건을 모두 '조치함'으로 닫아요`
        : report
          ? "신고는 열어 둬요"
          : null;

  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
        {step === "form" ? (
          <>
            <DialogTitle className="break-words">{ct.title}</DialogTitle>
            <DialogDescription>
              {isReactivate ? "메모는 관리자 기록에만 남아요." : "규칙 위반 사유를 고르면 기록이 남고, 당사자에게 사유가 알려져요."}
            </DialogDescription>
            <div className="mt-2 space-y-4">
              {isReactivate ? (
                <div>
                  <label htmlFor="mod-memo" className="text-sm font-semibold text-ink">
                    메모 <span className="font-normal text-muted">(선택)</span>
                  </label>
                  <Textarea
                    id="mod-memo"
                    value={note}
                    disabled={busy}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setFormError(null);
                    }}
                    className="mt-2 min-h-20 text-base"
                  />
                  <div className="mt-1 flex justify-between gap-3 text-xs text-muted">
                    <p>관리자 기록에만 남아요 · 당사자에게 보이지 않아요</p>
                    <p className="shrink-0">
                      {charCount(note.trim())}/{NOTE_MAX}
                    </p>
                  </div>
                </div>
              ) : (
                <ViolationFields
                  idPrefix="mod"
                  reasonLabel="위반 사유"
                  reason={reason}
                  note={note}
                  onReason={(v) => {
                    setReason(v);
                    setFormError(null);
                  }}
                  onNote={(v) => {
                    setNote(v);
                    setFormError(null);
                  }}
                  disabled={busy}
                  noteHint={noteVisibilityHint(reason)}
                />
              )}
              {report && (
                <div>
                  <label htmlFor="mod-scope" className="text-sm font-semibold text-ink">
                    조치 뒤 신고
                  </label>
                  <select
                    id="mod-scope"
                    value={scope}
                    disabled={busy}
                    onChange={(e) => setScope(e.target.value as CloseScope)}
                    className="mt-2 h-12 w-full rounded-xl border border-line bg-white px-3 text-base text-ink"
                  >
                    <option value="this">이 신고를 &apos;조치함&apos;으로 닫기</option>
                    {report.openCount > 1 && <option value="all">같은 대상 열린 신고 {report.openCount}건 모두 닫기</option>}
                    <option value="none">신고는 열어 두기</option>
                  </select>
                </div>
              )}
              {formError && (
                <p role="alert" className="rounded-xl bg-warn-bg p-3 text-sm font-semibold text-warn">
                  {formError}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-11 border-line" disabled={busy} onClick={close}>
                취소
              </Button>
              <Button className="h-11 bg-ink text-white" disabled={busy} onClick={next}>
                다음
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogTitle className="break-words">{ct.title}</DialogTitle>
            <DialogDescription className="sr-only">조치 내용을 확인합니다</DialogDescription>
            <ul className="mt-2 space-y-2 text-sm text-ink">
              {ct.lines.map((l) => (
                <li key={l} className="break-words rounded-xl bg-surface px-3 py-2">
                  {l}
                </li>
              ))}
              {scopeLine && <li className="rounded-xl bg-surface px-3 py-2">{scopeLine}</li>}
            </ul>
            {formError && (
              <p role="alert" className="rounded-xl bg-warn-bg p-3 text-sm font-semibold text-warn">
                {formError}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                className="h-11 border-line"
                disabled={busy}
                onClick={() => {
                  setFormError(null);
                  setStep("form");
                }}
              >
                돌아가기
              </Button>
              <Button
                className={`h-11 text-white ${request.action === "ban" ? "bg-warn" : "bg-ink"}`}
                disabled={busy}
                onClick={() => void run()}
              >
                {busy ? "처리하는 중…" : ct.confirm}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
