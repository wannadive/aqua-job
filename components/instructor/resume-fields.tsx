"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { avatarUrl, uploadAvatar } from "@/lib/instructor/api";
import {
  AGE_BAND_OPTIONS, CERT_ORG_OPTIONS, DAY_OPTIONS, GENDER_OPTIONS, MBTI_OPTIONS,
  REGION_OPTIONS, SCOPE_OPTIONS, STYLE_TAG_OPTIONS, TIME_OPTIONS,
} from "@/lib/instructor/config";
import { formatRecords, parseMeterInput, parseStaInput } from "@/lib/instructor/logic";
import type { InstructorProfile, Records, ResumeStep, Scope } from "@/lib/instructor/types";

export type Draft = Partial<InstructorProfile>;

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-[52px] rounded-card border px-4 py-3 text-left text-base font-medium transition-colors ${
        selected ? "border-accent bg-ok-bg text-ok" : "border-line bg-white text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function SingleGrid({ options, value, onChange, cols = 1 }: { options: readonly string[]; value: string | null | undefined; onChange: (v: string) => void; cols?: 1 | 2 | 3 }) {
  const grid = cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1";
  return (
    <div className={`grid gap-2 ${grid}`}>
      {options.map((o) => (
        <Option key={o} selected={value === o} onClick={() => onChange(o)}>
          {o}
        </Option>
      ))}
    </div>
  );
}

function MultiGrid({ options, value, onChange, cols = 1 }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; cols?: 1 | 2 | 3 }) {
  const grid = cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1";
  return (
    <div className={`grid gap-2 ${grid}`}>
      {options.map((o) => (
        <Option key={o} selected={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>
          {o}
        </Option>
      ))}
    </div>
  );
}

function RecordsInput({ value, onChange }: { value: Records; onChange: (r: Records) => void }) {
  const initial = Object.fromEntries(formatRecords(value).map((r) => [r.label, r.value.replace(/m$/, "")])) as Record<string, string>;
  const [raw, setRaw] = useState<Record<string, string>>(initial);
  const set = (label: "STA" | "DYN" | "CWT" | "FIM", text: string) => {
    const next = { ...raw, [label]: text };
    setRaw(next);
    const sta = parseStaInput(next.STA ?? "");
    const dyn = parseMeterInput(next.DYN ?? "");
    const cwt = parseMeterInput(next.CWT ?? "");
    const fim = parseMeterInput(next.FIM ?? "");
    const r: Records = {};
    if (sta != null) r.staSec = sta;
    if (dyn != null) r.dynM = dyn;
    if (cwt != null) r.cwtM = cwt;
    if (fim != null) r.fimM = fim;
    onChange(r);
  };
  const fields: { label: "STA" | "DYN" | "CWT" | "FIM"; ph: string; unit: string }[] = [
    { label: "STA", ph: "5:12", unit: "분:초" },
    { label: "DYN", ph: "150", unit: "m" },
    { label: "CWT", ph: "42", unit: "m" },
    { label: "FIM", ph: "50", unit: "m" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((f) => (
        <label key={f.label} className="block">
          <span className="text-sm font-semibold text-ink">
            {f.label} <span className="font-normal text-muted">({f.unit})</span>
          </span>
          <Input inputMode={f.label === "STA" ? "text" : "numeric"} placeholder={f.ph} value={raw[f.label] ?? ""} onChange={(e) => set(f.label, e.target.value)} className="mt-1 h-12 bg-white" />
        </label>
      ))}
      <p className="col-span-2 text-xs text-muted">본인이 입력한 기록이에요 (본인 입력)</p>
    </div>
  );
}

function CertsInput({ draft, setDraft }: { draft: Draft; setDraft: (p: Draft) => void }) {
  const certs = draft.certifications && draft.certifications.length > 0 ? draft.certifications : [{ org: "", level: "" }];
  const update = (i: number, patch: Partial<{ org: string; level: string }>) =>
    setDraft({ certifications: certs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  return (
    <div className="space-y-4">
      {certs.map((c, i) => (
        <div key={i} className="space-y-2 rounded-card bg-white p-3">
          <div className="flex flex-wrap gap-2">
            {CERT_ORG_OPTIONS.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={c.org === o}
                onClick={() => update(i, { org: o })}
                className={`rounded-full border px-3 py-2 text-sm font-medium ${c.org === o ? "border-accent bg-ok-bg text-ok" : "border-line text-ink"}`}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="등급 (예: 강사 트레이너)" value={c.level} onChange={(e) => update(i, { level: e.target.value })} className="h-12" />
            {certs.length > 1 && (
              <button type="button" aria-label="삭제" onClick={() => setDraft({ certifications: certs.filter((_, idx) => idx !== i) })} className="px-2 text-muted">
                <X className="size-5" />
              </button>
            )}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setDraft({ certifications: [...certs, { org: "", level: "" }] })} className="flex items-center gap-1 text-sm font-semibold text-ok">
        <Plus className="size-4" /> 자격 추가
      </button>
    </div>
  );
}

function PhotoInput({ draft, setDraft }: { draft: Draft; setDraft: (p: Draft) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = avatarUrl(draft.photoPath ?? null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const res = await uploadAvatar(file);
    setBusy(false);
    if (res.error || !res.path) {
      toast.error(res.error ?? "사진을 올리지 못했어요");
      return;
    }
    setDraft({ photoPath: res.path });
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <button type="button" onClick={() => ref.current?.click()} className="flex size-40 items-center justify-center overflow-hidden rounded-full border border-dashed border-line bg-white text-sm text-muted">
        {url ? <img src={url} alt="프로필 사진" className="size-full object-cover" /> : busy ? "올리는 중…" : "사진 고르기"}
      </button>
      {url && (
        <button type="button" onClick={() => ref.current?.click()} className="text-sm font-semibold text-ok">
          {busy ? "올리는 중…" : "다른 사진으로 바꾸기"}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}

/** 질문 하나의 입력 화면. 가입 마법사와 이력서 수정 화면이 같이 쓴다. */
export function StepInput({ step, draft, setDraft }: { step: ResumeStep; draft: Draft; setDraft: (p: Draft) => void }) {
  switch (step.key) {
    case "gender":
      return <SingleGrid options={GENDER_OPTIONS} value={draft.gender} onChange={(v) => setDraft({ gender: v })} />;
    case "ageBand":
      return <SingleGrid options={AGE_BAND_OPTIONS} value={draft.ageBand} onChange={(v) => setDraft({ ageBand: v })} cols={2} />;
    case "regions":
      return <MultiGrid options={REGION_OPTIONS} value={draft.regions ?? []} onChange={(v) => setDraft({ regions: v })} cols={2} />;
    case "scopes": {
      const labels = SCOPE_OPTIONS.map((s) => s.label);
      const toLabel = (v: string) => SCOPE_OPTIONS.find((s) => s.value === v)?.label ?? v;
      return (
        <MultiGrid
          options={labels}
          value={(draft.scopes ?? []).map(toLabel)}
          onChange={(ls) => setDraft({ scopes: ls.map((l) => SCOPE_OPTIONS.find((s) => s.label === l)!.value as Scope) })}
        />
      );
    }
    case "certifications":
      return <CertsInput draft={draft} setDraft={setDraft} />;
    case "instructorYears":
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            placeholder="0"
            value={draft.instructorYears ?? ""}
            onChange={(e) => setDraft({ instructorYears: e.target.value === "" ? null : Math.max(0, Math.min(60, Math.floor(Number(e.target.value)))) })}
            className="h-14 w-32 bg-white text-xl"
          />
          <span className="text-base text-ink">년</span>
        </div>
      );
    case "records":
      return <RecordsInput value={draft.records ?? {}} onChange={(r) => setDraft({ records: r })} />;
    case "mbti":
      return <SingleGrid options={MBTI_OPTIONS} value={draft.mbti} onChange={(v) => setDraft({ mbti: v })} cols={3} />;
    case "teachingStyleTags":
      return <MultiGrid options={STYLE_TAG_OPTIONS} value={draft.teachingStyleTags ?? []} onChange={(v) => setDraft({ teachingStyleTags: v })} cols={2} />;
    case "intro":
      return (
        <Textarea
          rows={6}
          maxLength={500}
          placeholder="수업 방식, 강점 등을 편하게 적어주세요"
          value={draft.intro ?? ""}
          onChange={(e) => setDraft({ intro: e.target.value })}
          className="bg-white text-base"
        />
      );
    case "availableDays":
      return (
        <div className="space-y-5">
          <MultiGrid options={DAY_OPTIONS} value={draft.availableDays ?? []} onChange={(v) => setDraft({ availableDays: v })} cols={3} />
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">시간대</div>
            <SingleGrid options={TIME_OPTIONS} value={draft.availableTime} onChange={(v) => setDraft({ availableTime: v })} cols={2} />
          </div>
        </div>
      );
    case "desiredRate":
      return <Input placeholder="예: 회당 8만원부터" maxLength={60} value={draft.desiredRate ?? ""} onChange={(e) => setDraft({ desiredRate: e.target.value })} className="h-14 bg-white text-base" />;
    case "photoPath":
      return <PhotoInput draft={draft} setDraft={setDraft} />;
    default:
      return null;
  }
}
