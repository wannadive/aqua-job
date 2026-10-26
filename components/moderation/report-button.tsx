"use client";

import { useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { submitReport } from "@/lib/moderation/api";
import { REPORT_DONE_TEXT, reportSheetTitle, violationInputError } from "@/lib/moderation/logic";
import type { ReportTarget, ViolationReason } from "@/lib/moderation/types";
import { ViolationFields } from "./violation-fields";
import { isDirty } from "@/lib/navigation/dirty";
import { useLeaveGuard } from "@/lib/navigation/use-navigable";

/**
 * [신고하기] 버튼 + 신고 시트. 누가 보이게 할지는 부르는 쪽이 정한다(로그인한 활성 회원 · 내 것 아님).
 * 대상 확인·한도·볼 수 있는지는 서버(submit_report)가 한다. 결과·다른 신고는 보여 주지 않는다.
 */
export function ReportButton({ target, className }: { target: ReportTarget; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-11 items-center gap-1.5 px-2 text-sm font-semibold text-muted ${className ?? ""}`}
      >
        <Flag className="size-4" /> 신고하기
      </button>
      <ReportSheet target={open ? target : null} onClose={() => setOpen(false)} />
    </>
  );
}

export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState<ViolationReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  // 열 때마다(대상이 바뀌거나 닫힐 때마다) 바뀌는 번호 — 늦게 온 결과가 다시 연 다른 시트를 건드리지 않게
  const openSeq = useRef(0);
  const key = target ? `${target.type}:${target.id}` : null;
  // 작성 중 = 사유를 골랐거나 설명을 적음. 폰 뒤로가기·취소·바깥 누름 전에 묻는다
  // 보내는 중에는 묻지 않고, 시트를 닫는 폰 뒤로가기는 조용히 되돌린다(busy)
  const guard = useLeaveGuard(key !== null && isDirty({ reason: null, note: "" }, { reason, note }), { busy: busy && key !== null });
  const close = () => {
    if (guard.isSending() || !guard.confirmLeave()) return;
    onClose();
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 대상이 바뀌거나 다시 열면 입력을 비운다
  useEffect(() => {
    openSeq.current++;
    if (!key) {
      // 닫히면 보내는 중 표시를 푼다(다시 열 때 보내는 중으로 시작하지 않게)
      setBusy(false);
      submitting.current = false;
      return;
    }
    setReason(null);
    setNote("");
    setFormError(null);
    setBusy(false);
    submitting.current = false;
  }, [key]);

  const submit = async () => {
    if (!target || submitting.current) return;
    const invalid = violationInputError(reason, note);
    if (invalid || !reason) {
      setFormError(invalid ?? "사유를 골라 주세요");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFormError(null);
    const token = openSeq.current;
    // 화면이 닫혔거나(역할 전환·로그아웃) 이 시트가 그 사이 닫혔거나 다른 대상으로 다시 열렸으면 안내만
    const stale = () => !mounted.current || openSeq.current !== token;
    const res = await submitReport(target, reason, note);
    if (res.error) {
      toast.error(res.error);
      if (stale()) return;
      setFormError(res.error);
      submitting.current = false;
      setBusy(false);
      return;
    }
    toast.success(REPORT_DONE_TEXT);
    if (stale()) return;
    guard.release(); // 보냈으니 닫을 때 묻지 않는다
    // 닫힐 때까지 busy 유지(이중 제출 방지)
    onClose();
  };

  return (
    <Sheet open={target !== null} onOpenChange={(v) => !v && close()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left text-lg font-bold text-ink">{target ? reportSheetTitle(target.type) : "신고하기"}</SheetTitle>
          <SheetDescription className="text-left text-sm text-muted">
            규칙 위반(가짜 서류·허위 공고·연락처 수집 목적·불법 행위)을 알려 주세요. 운영팀이 확인해요.
          </SheetDescription>
        </SheetHeader>
        {target && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-surface p-4">
              <p className="break-words text-base font-bold text-ink">{target.label}</p>
            </div>

            <ViolationFields
              idPrefix="report"
              reason={reason}
              note={note}
              onReason={(r) => {
                setReason(r);
                setFormError(null);
              }}
              onNote={(n) => {
                setNote(n);
                setFormError(null);
              }}
              disabled={busy}
              notePlaceholder="무엇이 규칙에 어긋나는지 적어 주세요. 연락처는 적지 말아 주세요"
              noteHint="운영팀만 봐요. 신고한 사람은 상대방에게 알려지지 않아요"
            />

            {formError && (
              <p role="alert" className="rounded-xl bg-warn-bg p-3 text-sm font-semibold text-warn">
                {formError}
              </p>
            )}

            <p className="text-xs leading-relaxed text-muted">
              같은 대상은 24시간에 한 번, 하루 20건까지 신고할 수 있어요. 처리 결과는 따로 알려 드리지 않아요.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-[52px] border-line text-base" disabled={busy} onClick={close}>
                취소
              </Button>
              <Button className="h-[52px] bg-ink text-base text-white" disabled={busy} onClick={() => void submit()}>
                {busy ? "보내는 중…" : "신고하기"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
