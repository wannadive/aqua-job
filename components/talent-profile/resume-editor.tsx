"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { fetchMyContacts, fetchMyInstructorProfile, saveInstructorProfile, saveMyContacts } from "@/lib/talent-profile/api";
import { RESUME_STEPS } from "@/lib/talent-profile/logic";
import type { PrivateContacts } from "@/lib/talent-profile/types";
import { StepInput, type Draft } from "./resume-fields";
import { isDirty } from "@/lib/navigation/dirty";
import { useLeaveGuard } from "@/lib/navigation/use-navigable";

type StepKey = (typeof RESUME_STEPS)[number]["key"];

const SECTIONS: { title: string; keys: StepKey[] }[] = [
  { title: "기본", keys: ["photoPath", "gender", "ageBand", "intro"] },
  { title: "성향", keys: ["mbti", "teachingStyleTags"] },
  { title: "프리다이빙 스펙", keys: ["certifications", "instructorYears", "records"] },
  { title: "이력", keys: ["scopes", "regions"] },
  { title: "가능 조건", keys: ["availableDays", "desiredRate"] },
];

const SELF_REPORTED: StepKey[] = ["certifications", "instructorYears", "intro"];

const LABEL: Partial<Record<StepKey, string>> = {
  photoPath: "프로필 사진", gender: "성별", ageBand: "나이대", intro: "자기소개",
  mbti: "MBTI", teachingStyleTags: "수업 스타일", certifications: "자격 단체·등급",
  instructorYears: "강사 경력", records: "개인 기록", scopes: "주로 교육하는 곳",
  regions: "활동 지역", availableDays: "가능 요일·시간대", desiredRate: "희망 단가 (선택)",
};

export function ResumeEditor() {
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [contacts, setContacts] = useState<PrivateContacts>({ phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // 작성 중 판정의 처음 값: 불러온 값, 저장하면 저장한 값(이력서·연락처 따로)
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null);
  const [savedContacts, setSavedContacts] = useState<PrivateContacts>({ phone: "", email: "" });
  // 작성 중이면 탭 이동·역할 전환·알림 이동·폰 뒤로가기(앱 밖으로)·새로 고침 전에 묻는다
  useLeaveGuard(
    draft !== null && savedDraft !== null && (isDirty(savedDraft, draft) || isDirty(savedContacts, contacts)),
    { anchor: "mount" },
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    Promise.all([fetchMyInstructorProfile(), fetchMyContacts()])
      .then(([p, c]) => {
        if (cancelled) return;
        setDraftState(p ?? {});
        setContacts(c);
        setSavedDraft(p ?? {});
        setSavedContacts(c);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("이력서를 불러오지 못했어요");
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loadError)
    return (
      <div className="rounded-card bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-ink">이력서를 불러오지 못했어요</h1>
        <p className="mt-2 text-sm text-muted">네트워크를 확인하고 다시 시도해 주세요.</p>
        <Button className="mt-5 h-[52px] w-full bg-ink text-base text-white" onClick={() => setAttempt((n) => n + 1)}>
          다시 시도
        </Button>
      </div>
    );
  if (!draft) return <div className="py-20 text-center text-sm text-muted">불러오는 중…</div>;
  const setDraft = (p: Draft) => setDraftState((d) => ({ ...d, ...p }));

  const save = async () => {
    if (savingRef.current || !draft) return;
    savingRef.current = true;
    setSaving(true);
    // 보낸 값(저장하는 동안 더 고친 것은 다시 작성 중으로 남는다)
    const sentDraft = draft;
    const sentContacts = contacts;
    try {
      const { userId: _userId, onboardingDone: _o, ...patch } = sentDraft;
      void _userId;
      void _o;
      const res = await saveInstructorProfile(patch);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setSavedDraft(sentDraft);
      const cres = await saveMyContacts(sentContacts);
      if (cres.error) {
        toast.error(cres.error);
        return;
      }
      setSavedContacts(sentContacts);
      toast.success("이력서를 저장했어요");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">내 이력서</h1>

      {SECTIONS.map((sec) => (
        <section key={sec.title} className="rounded-card bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">{sec.title}</h2>
          <div className="mt-4 space-y-6">
            {sec.keys.map((k) => {
              const step = RESUME_STEPS.find((s) => s.key === k)!;
              return (
                <div key={k}>
                  <div className="mb-2 text-sm font-semibold text-ink">{LABEL[k]}{SELF_REPORTED.includes(k) && <span className="ml-1 font-normal text-muted">(본인 입력)</span>}</div>
                  <StepInput step={step} draft={draft} setDraft={setDraft} />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">연락처</h2>
        <p className="mt-1 text-sm text-muted">선택된 센터에만 보여요</p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-ink">휴대폰</span>
            <Input type="tel" inputMode="tel" value={contacts.phone} onChange={(e) => setContacts({ ...contacts, phone: e.target.value })} className="mt-1 h-12" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink">이메일</span>
            <Input type="email" value={contacts.email} onChange={(e) => setContacts({ ...contacts, email: e.target.value })} className="mt-1 h-12" />
          </label>
        </div>
      </section>

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">공개 설정</h2>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-base font-medium text-ink">센터에 내 프로필 공개</div>
            <div className="mt-0.5 text-sm text-muted">끄면 센터가 내 프로필을 찾아볼 수 없어요</div>
          </div>
          <Switch checked={draft.isPublic ?? true} onCheckedChange={(v) => setDraft({ isPublic: v })} aria-label="센터에 내 프로필 공개" />
        </div>
      </section>

      <Button className="h-[52px] w-full bg-ink text-base text-white" onClick={() => void save()} disabled={saving}>
        {saving ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}
