"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { adminResolveReport } from "@/lib/moderation/api";
import { NOTE_MAX, charCount, confirmText, isNetworkErrorText, memoInputError } from "@/lib/moderation/logic";

export interface ResolveRequest {
  reportId: string;
  status: "resolved" | "dismissed";
}

/** 신고 처리 완료 / 기각 확인 창(처리 메모 500자까지, 관리자 기록에만). 먼저 처리한 관리자가 있으면 서버가 거부한다. */
export function ResolveReportDialog({
  request,
  onClose,
  onDone,
}: {
  request: ResolveRequest;
  onClose: () => void;
  onDone: () => Promise<unknown> | void;
}) {
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ct = confirmText(request.status === "resolved" ? "resolve" : "dismiss");

  const finish = async () => {
    try {
      await onDone();
    } catch {
      /* 목록 화면이 따로 알린다 */
    }
  };

  const run = async () => {
    if (running.current) return;
    const err = memoInputError(memo);
    if (err) {
      setFormError(err);
      return;
    }
    running.current = true;
    setBusy(true);
    setFormError(null);
    const res = await adminResolveReport(request.reportId, request.status, memo);
    if (res.error) {
      toast.error(res.error);
      // 네트워크 오류·메모 길이: 창을 열어 둔 채 쓴 메모를 지킨다
      if (isNetworkErrorText(res.error) || res.error.includes("500자")) {
        if (!mounted.current) return;
        setFormError(res.error);
        running.current = false;
        setBusy(false);
        return;
      }
    } else {
      toast.success(request.status === "resolved" ? "신고를 '조치함'으로 닫았어요" : "신고를 기각했어요");
    }
    if (!mounted.current) return;
    // 성공이든 '이미 처리됨'이든 목록을 새로 불러와 실제 상태를 보여 준다
    await finish();
    if (mounted.current) onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
        <DialogTitle>{ct.title}</DialogTitle>
        <DialogDescription className="sr-only">신고 처리 내용을 확인합니다</DialogDescription>
        <ul className="mt-2 space-y-2 text-sm text-ink">
          {ct.lines.map((l) => (
            <li key={l} className="rounded-xl bg-surface px-3 py-2">
              {l}
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <label htmlFor="resolve-memo" className="text-sm font-semibold text-ink">
            처리 메모 <span className="font-normal text-muted">(선택)</span>
          </label>
          <Textarea
            id="resolve-memo"
            value={memo}
            disabled={busy}
            onChange={(e) => {
              setMemo(e.target.value);
              setFormError(null);
            }}
            className="mt-2 min-h-20 text-base"
          />
          <div className="mt-1 flex justify-between gap-3 text-xs text-muted">
            <p>관리자 기록에만 남아요</p>
            <p className="shrink-0">
              {charCount(memo.trim())}/{NOTE_MAX}
            </p>
          </div>
        </div>
        {formError && (
          <p role="alert" className="rounded-xl bg-warn-bg p-3 text-sm font-semibold text-warn">
            {formError}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 border-line" disabled={busy} onClick={onClose}>
            돌아가기
          </Button>
          <Button className="h-11 bg-ink text-white" disabled={busy} onClick={() => void run()}>
            {busy ? "처리하는 중…" : ct.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
