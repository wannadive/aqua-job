"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StepQuestion } from "@/components/shared/step-question";
import { Button } from "@/components/ui/button";
import { fetchMyInstructorProfile, saveInstructorProfile } from "@/lib/talent-profile/api";
import { RESUME_STEPS } from "@/lib/talent-profile/logic";
import { StepInput, type Draft } from "./resume-fields";
import { isDirty } from "@/lib/navigation/dirty";
import { useLeaveGuard } from "@/lib/navigation/use-navigable";

/** 이 단계에서 저장하는 칸(가능 요일 단계는 시간대도 함께) */
function stepKeys(key: string): string[] {
  return key === "availableDays" ? ["availableDays", "availableTime"] : [key];
}

// onComplete: 마지막 단계 저장 후 호출(셸이 계정 상태를 새로 읽음). 도메인은 셸을 import하지 않는다.
export function ResumeWizard({ onComplete }: { onComplete: () => Promise<void> }) {
  const [index, setIndex] = useState(0);
  const [draft, setDraftState] = useState<Draft>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // 작성 중 판정의 처음 값: 불러온 값, 단계를 저장할 때마다 저장한 값
  const [saved, setSaved] = useState<Draft>({});
  const curKey = RESUME_STEPS[index]?.key ?? "";
  const pickStep = (d: Draft) =>
    Object.fromEntries(stepKeys(curKey).map((k) => [k, (d as Record<string, unknown>)[k]]));
  // 지금 단계에서 저장하지 않은 답이 있으면 작성 중 — 역할 전환·알림 이동·폰 뒤로가기(앱 밖으로)·새로 고침 전에 묻는다
  useLeaveGuard(loaded && isDirty(pickStep(saved), pickStep(draft)), { anchor: "mount", busy });

  // 불러오기에 실패하면 빈 칸으로 이어 가지 않는다(저장된 답을 빈 값으로 덮어쓰는 것을 막는다).
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    fetchMyInstructorProfile()
      .then((p) => {
        if (cancelled) return;
        if (p) {
          setDraftState(p);
          setSaved(p);
        }
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
      <main className="mx-auto flex min-h-app w-full max-w-md flex-col justify-center px-4 py-10">
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
    return <main className="flex min-h-app items-center justify-center text-sm text-muted">불러오는 중…</main>;
  }

  const step = RESUME_STEPS[index];
  const isLast = index === RESUME_STEPS.length - 1;
  const setDraft = (p: Draft) => setDraftState((d) => ({ ...d, ...p }));

  // 답을 저장하고 다음으로. skip이면 이 화면 답은 저장하지 않는다.
  const advance = async (skip: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
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
          setSaved((prev) => ({ ...prev, ...patch }));
        }
      }
      if (isLast) {
        await onComplete();
        return;
      }
      setIndex((i) => i + 1);
    } finally {
      busyRef.current = false;
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
