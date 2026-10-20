"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchMyDocuments } from "@/lib/verification/api";
import { DOC_TYPES } from "@/lib/verification/config";
import { displayStatus, latestByType, todayKst } from "@/lib/verification/logic";
import type { DocRecord, DocType } from "@/lib/verification/types";
import { DocumentUploadSheet } from "./document-upload-sheet";
import { FactBadge } from "./fact-badge";

export function DocumentList({ owner }: { owner: "instructor" | "center" }) {
  const [docs, setDocs] = useState<DocRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState<DocType | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    fetchMyDocuments()
      .then((l) => !cancelled && setDocs(l))
      .catch(() => {
        if (!cancelled) {
          toast.error("서류를 불러오지 못했어요");
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const today = todayKst();
  const latest = useMemo(() => latestByType(docs ?? []), [docs]);
  const types = (Object.keys(DOC_TYPES) as DocType[]).filter((t) => DOC_TYPES[t].owner === owner);

  const start = (t: DocType) => {
    setTarget(t);
    setOpen(true);
  };

  return (
    <section className="rounded-card bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-ink">서류</h2>
      <p className="mt-1 text-sm text-muted">제출한 서류 사진은 본인과 관리자만 볼 수 있어요.</p>

      {loadError ? (
        <div className="mt-4 text-center">
          <p className="text-sm text-muted">서류를 불러오지 못했어요</p>
          <Button variant="outline" className="mt-3 h-12" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </Button>
        </div>
      ) : !docs ? (
        <p className="mt-4 text-sm text-muted">불러오는 중…</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {types.map((t) => {
            const d = latest[t];
            const st = displayStatus(d, today);
            const cfg = DOC_TYPES[t];
            return (
              <li key={t} className="rounded-xl bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-semibold text-ink">
                    {cfg.label}
                    {!cfg.required && <span className="ml-1 text-sm font-normal text-muted">(선택)</span>}
                  </div>
                  {st === "missing" && <span className="text-sm text-muted">미제출</span>}
                </div>
                {d && (
                  <div className="mt-2">
                    <FactBadge doc={d} today={today} />
                  </div>
                )}
                {st === "rejected" && d?.rejectReason && <p className="mt-2 text-sm text-destructive">반려 사유: {d.rejectReason}</p>}
                {st !== "verified" && (
                  <Button variant="outline" className="mt-3 h-11 w-full bg-white" onClick={() => start(t)}>
                    {st === "missing" ? "제출하기" : "다시 올리기"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <DocumentUploadSheet docType={target} open={open} onOpenChange={setOpen} onSubmitted={() => setAttempt((n) => n + 1)} />
    </section>
  );
}
