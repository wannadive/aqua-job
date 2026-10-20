"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { fetchMyContacts, fetchMyInstructorProfile, saveInstructorProfile, saveMyContacts } from "@/lib/instructor/api";
import { RESUME_STEPS } from "@/lib/instructor/logic";
import type { PrivateContacts } from "@/lib/instructor/types";
import { StepInput, type Draft } from "./resume-fields";

type StepKey = (typeof RESUME_STEPS)[number]["key"];

const SECTIONS: { title: string; keys: StepKey[] }[] = [
  { title: "기본", keys: ["photoPath", "gender", "ageBand", "intro"] },
  { title: "성향", keys: ["mbti", "teachingStyleTags"] },
  { title: "프리다이빙 스펙", keys: ["certifications", "instructorYears", "records"] },
  { title: "이력", keys: ["scopes", "regions"] },
  { title: "가능 조건", keys: ["availableDays", "desiredRate"] },
];

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

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyInstructorProfile(), fetchMyContacts()])
      .then(([p, c]) => {
        if (cancelled) return;
        setDraftState(p ?? {});
        setContacts(c);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("이력서를 불러오지 못했어요");
          setDraftState({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!draft) return <div className="py-20 text-center text-sm text-muted">불러오는 중…</div>;
  const setDraft = (p: Draft) => setDraftState((d) => ({ ...d, ...p }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { userId: _userId, onboardingDone: _o, ...patch } = draft;
      void _userId;
      void _o;
      const res = await saveInstructorProfile(patch);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const cres = await saveMyContacts(contacts);
      if (cres.error) {
        toast.error(cres.error);
        return;
      }
      toast.success("이력서를 저장했어요");
    } finally {
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
                  <div className="mb-2 text-sm font-semibold text-ink">{LABEL[k]}</div>
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
