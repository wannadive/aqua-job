"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StepQuestion } from "@/components/shared/step-question";
import { fetchMyInstructorProfile, saveInstructorProfile } from "@/lib/instructor/api";
import { RESUME_STEPS } from "@/lib/instructor/logic";
import { useAuth } from "@/lib/supabase/auth-provider";
import { StepInput, type Draft } from "./resume-fields";

export function ResumeWizard() {
  const { refreshAccount } = useAuth();
  const [index, setIndex] = useState(0);
  const [draft, setDraftState] = useState<Draft>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyInstructorProfile()
      .then((p) => {
        if (!cancelled && p) setDraftState(p);
      })
      .catch(() => toast.error("저장된 내용을 불러오지 못했어요"))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

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
