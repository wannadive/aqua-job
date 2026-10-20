"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  help?: string;
  /** 0~1 */
  progress: number;
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  children: ReactNode;
}

export function StepQuestion({ title, help, progress, onNext, onBack, onSkip, nextLabel = "다음", nextDisabled, busy, children }: Props) {
  return (
    <main className="mx-auto flex min-h-app w-full max-w-md flex-col px-5 pb-6 pt-4">
      <div className="flex h-10 items-center gap-3">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="이전" className="-ml-2 p-2 text-ink">
            <ChevronLeft className="!size-6" />
          </button>
        ) : (
          <span className="w-6" />
        )}
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </div>
      </div>
      <h1 className="mt-8 text-[26px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
      {help && <p className="mt-2 text-sm text-muted">{help}</p>}
      <div className="mt-8 flex-1">{children}</div>
      <div className="mt-6 flex flex-col gap-2">
        <Button className="h-[52px] w-full bg-ink text-base text-white" onClick={onNext} disabled={nextDisabled || busy}>
          {busy ? "저장 중…" : nextLabel}
        </Button>
        {onSkip && (
          <button type="button" onClick={onSkip} disabled={busy} className="py-2 text-center text-sm font-medium text-muted">
            나중에 할게요
          </button>
        )}
      </div>
    </main>
  );
}
