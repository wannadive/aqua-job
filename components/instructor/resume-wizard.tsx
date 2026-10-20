"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StepQuestion } from "@/components/shared/step-question";
import { Button } from "@/components/ui/button";
import { fetchMyInstructorProfile, saveInstructorProfile } from "@/lib/instructor/api";
import { RESUME_STEPS } from "@/lib/instructor/logic";
import { useAuth } from "@/lib/supabase/auth-provider";
import { StepInput, type Draft } from "./resume-fields";

export function ResumeWizard() {
  const { refreshAccount } = useAuth();
  const [index, setIndex] = useState(0);
  const [draft, setDraftState] = useState<Draft>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  // 불러오기에 실패하면 빈 칸으로 이어 가지 않는다(저장된 답을 빈 값으로 덮어쓰는 것을 막는다).
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    fetchMyInstructorProfile()
      .then((p) => {
        if (cancelled) return;
        if (p) setDraftState(p);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("저장된 내용을 불러오지 못했어요");
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="rounded-card bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-ink">저장된 내용을 불러오지 못했어요</h1>
          <p className="mt-2 text-sm text-muted">네트워크를 확인하고 다시 시도해 주세요.</p>
          <Button className="mt-5 h-[52px] w-full bg-ink text-base text-white" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </Button>
        </div>
      </main>
    );
  }

  if (!loaded) {
    return <main className="flex min-h-dvh items-center justify-center text-sm text-muted">불러오는 중…</main>;
  }

  const step = RESUME_STEPS[index];
  const isLast = index === RESUME_STEPS.length - 1;
  const setDraft = (p: Draft) => setDraftState((d) => ({ ...d, ...p }));

  // 답을 저장하고 다음으로. skip이면 이 화면 답은 저장하지 않는다.
  const advance = async (skip: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!skip || isLast) {
        const patch: Draft = {};
        if (!skip) {
          if (step.key === "availableDays") {
            patch.availableDays = draft.availableDays ?? [];
            patch.availableTime = draft.availableTime ?? null;
          } else if (step.key !== "photoPath" || draft.photoPath) {
            (patch as Record<string, unknown>)[step.key] = (draft as Record<string, unknown>)[step.key];
          }
        }
        if (isLast) patch.onboardingDone = true;
        if (Object.keys(patch).length > 0) {
          const res = await saveInstructorProfile(patch);
          if (res.error) {
            toast.error(res.error);
            return;
          }
        }
      }
      if (isLast) {
        await refreshAccount();
        return;
      }
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepQuestion
      key={step.key}
      title={step.title}
      help={step.help}
      progress={(index + 1) / RESUME_STEPS.length}
      onBack={index > 0 ? () => setIndex((i) => i - 1) : undefined}
      onNext={() => void advance(false)}
      onSkip={() => void advance(true)}
      nextLabel={isLast ? "완료" : "다음"}
      busy={busy}
    >
      <StepInput step={step} draft={draft} setDraft={setDraft} />
    </StepQuestion>
  );
}
