"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchMyCenterProfile, saveCenterProfile } from "@/lib/center/api";
import type { CenterProfile } from "@/lib/center/types";
import { DAY_OPTIONS, TIME_OPTIONS } from "@/lib/instructor/config";
import { avatarUrl, uploadAvatar } from "@/lib/storage/avatars";

type Draft = Partial<CenterProfile>;

const MAX_PHOTOS = 5;

function Field({ label, selfReported, children }: { label: string; selfReported?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-ink">
        {label}
        {selfReported && <span className="ml-1 font-normal text-muted">(본인 입력)</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-[52px] rounded-card border px-4 py-3 text-base font-medium transition-colors ${
        selected ? "border-accent bg-ok-bg text-ok" : "border-line bg-white text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function TextListInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t || value.includes(t)) {
      setText("");
      return;
    }
    onChange([...value, t]);
    setText("");
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((v) => (
            <span key={v} className="flex items-center gap-1 rounded-full bg-ok-bg px-3 py-2 text-sm font-medium text-ok">
              {v}
              <button type="button" aria-label={`${v} 삭제`} onClick={() => onChange(value.filter((x) => x !== v))}>
                <X className="size-4" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={text}
          placeholder={placeholder}
          maxLength={40}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
          className="h-12 bg-white"
        />
        <Button type="button" variant="outline" className="h-12 px-4" onClick={add}>
          <Plus className="size-4" /> 추가
        </Button>
      </div>
    </div>
  );
}

function PhotosInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let next = value;
    try {
      for (const f of Array.from(files)) {
        if (next.length >= MAX_PHOTOS) {
          toast.error(`사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
          break;
        }
        const res = await uploadAvatar(f);
        if (res.error || !res.path) {
          toast.error(res.error ?? "사진을 올리지 못했어요");
          break;
        }
        next = [...next, res.path];
      }
    } finally {
      setBusy(false);
      onChange(next);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {value.map((p) => (
          <div key={p} className="relative aspect-square overflow-hidden rounded-xl bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl(p) ?? ""} alt="센터 사진" className="size-full object-cover" />
            <button
              type="button"
              aria-label="사진 삭제"
              onClick={() => onChange(value.filter((x) => x !== p))}
              className="absolute right-1 top-1 rounded-full bg-ink/70 p-1 text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {value.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            disabled={busy}
            className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-line bg-white text-sm text-muted"
          >
            {busy ? "올리는 중…" : "사진 추가"}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">최대 {MAX_PHOTOS}장</p>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void pick(e.target.files)} />
    </div>
  );
}

function NumberInput({ value, onChange, unit, max }: { value: number | null | undefined; onChange: (v: number | null) => void; unit: string; max: number }) {
  // 입력 중에는 친 글자 그대로 두고, 포커스를 벗어날 때 0~max 범위로 맞춘다(저장되는 값은 항상 범위 안).
  const [text, setText] = useState<string | null>(null);
  const clamp = (raw: string): number | null => (raw === "" || Number.isNaN(Number(raw)) ? null : Math.max(0, Math.min(max, Math.floor(Number(raw)))));
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        placeholder="0"
        value={text ?? value ?? ""}
        onChange={(e) => {
          setText(e.target.value);
          onChange(clamp(e.target.value));
        }}
        onBlur={() => setText(null)}
        className="h-12 w-32 bg-white text-lg"
      />
      <span className="text-base text-ink">{unit}</span>
    </div>
  );
}

export function CenterProfileForm() {
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    fetchMyCenterProfile()
      .then((p) => {
        if (!cancelled) setDraftState(p ?? {});
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("센터 정보를 불러오지 못했어요");
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
        <h2 className="text-lg font-bold text-ink">센터 정보를 불러오지 못했어요</h2>
        <p className="mt-2 text-sm text-muted">네트워크를 확인하고 다시 시도해 주세요.</p>
        <Button className="mt-5 h-[52px] w-full bg-ink text-base text-white" onClick={() => setAttempt((n) => n + 1)}>
          다시 시도
        </Button>
      </div>
    );
  if (!draft) return <div className="py-20 text-center text-sm text-muted">불러오는 중…</div>;

  const set = (p: Draft) => setDraftState((d) => ({ ...d, ...p }));

  const save = async () => {
    if (saving || !draft) return;
    setSaving(true);
    try {
      const { userId: _u, ...patch } = draft;
      void _u;
      const res = await saveCenterProfile(patch);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("센터 정보를 저장했어요");
    } finally {
      setSaving(false);
    }
  };

  const days = draft.teachingDays ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">센터 기본 정보</h2>
        <div className="mt-4 space-y-6">
          <Field label="센터명">
            <Input value={draft.centerName ?? ""} maxLength={40} onChange={(e) => set({ centerName: e.target.value })} className="h-12" />
          </Field>
          <Field label="대표자">
            <Input value={draft.representativeName ?? ""} maxLength={20} onChange={(e) => set({ representativeName: e.target.value })} className="h-12" />
          </Field>
          <Field label="사업장 주소">
            <Input value={draft.address ?? ""} maxLength={100} onChange={(e) => set({ address: e.target.value })} className="h-12" />
          </Field>
          <Field label="센터 사진">
            <PhotosInput value={draft.photoPaths ?? []} onChange={(v) => set({ photoPaths: v })} />
          </Field>
        </div>
      </section>

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">강사진</h2>
        <div className="mt-4 space-y-6">
          <Field label="대표강사">
            <Input value={draft.headInstructor ?? ""} maxLength={20} onChange={(e) => set({ headInstructor: e.target.value })} className="h-12" />
          </Field>
          <Field label="소속강사 수" selfReported>
            <NumberInput value={draft.instructorCount} onChange={(v) => set({ instructorCount: v })} unit="명" max={200} />
          </Field>
          <Field label="소속강사 명단" selfReported>
            <TextListInput value={draft.instructorNames ?? []} onChange={(v) => set({ instructorNames: v })} placeholder="강사 이름" />
          </Field>
        </div>
      </section>

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">교육 현황</h2>
        <div className="mt-4 space-y-6">
          <Field label="월 교육생 수" selfReported>
            <NumberInput value={draft.monthlyStudents} onChange={(v) => set({ monthlyStudents: v })} unit="명" max={9999} />
          </Field>
          <Field label="교육 요일">
            <div className="grid grid-cols-4 gap-2">
              {DAY_OPTIONS.map((d) => (
                <Chip key={d} selected={days.includes(d)} onClick={() => set({ teachingDays: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] })}>
                  {d}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="교육 시간대">
            <div className="grid grid-cols-2 gap-2">
              {TIME_OPTIONS.map((t) => (
                <Chip key={t} selected={draft.teachingTime === t} onClick={() => set({ teachingTime: t })}>
                  {t}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="주 교육 장소">
            <TextListInput value={draft.venues ?? []} onChange={(v) => set({ venues: v })} placeholder="예: 잠실 수영장" />
          </Field>
        </div>
      </section>

      <Button className="h-[52px] w-full bg-ink text-base text-white" onClick={() => void save()} disabled={saving}>
        {saving ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}
