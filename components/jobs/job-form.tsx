"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchMyCenterProfile } from "@/lib/center-listing/api";
import { createJob, fetchRequirementRules, getJobDetail, updateJob } from "@/lib/jobs/api";
import { JOB_TYPES, PAY_UNITS, REQUIREMENT_TAGS } from "@/lib/jobs/config";
import { defaultDeadline, maxDeadline, missingForJobType } from "@/lib/jobs/logic";
import type { DestinationKind, JobInput, JobSummary, JobType, PayUnit, RequirementRule } from "@/lib/jobs/types";
import { DAY_OPTIONS, REGION_OPTIONS } from "@/lib/talent-profile/config";
import { DOC_TYPES } from "@/lib/verification/config";
import { effectiveDoc } from "@/lib/verification/effective";
import { fetchMyDocuments } from "@/lib/verification/api";
import { todayKst } from "@/lib/verification/logic";
import type { DocType } from "@/lib/verification/types";
import { EMPTY, draftToInput, validateDraft, type Draft } from "@/lib/jobs/form";
import { JobCard } from "./job-card";

const TYPE_DESC: Record<JobType, string> = {
  lesson: "정해진 날 한 번 하는 수업을 맡길 강사를 찾아요",
  affiliation: "센터에 소속되어 꾸준히 일할 강사를 찾아요",
  tour: "투어에 함께 갈 동행 강사를 찾아요",
};

function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto max-w-md">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-ink">
        {label}
        {hint && <span className="ml-1 font-normal text-muted">{hint}</span>}
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
      className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        selected ? "border-accent bg-ok-bg text-ok" : "border-line bg-white text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** 받침 있으면 "이", 없으면 "가" (예: 등록증이 / 자격증이 / 보험이) */
function withJosa(word: string): string {
  const c = word.charCodeAt(word.length - 1);
  const hasBatchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? "이" : "가");
}

function sliceTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

export function JobForm({
  editJobId,
  onClose,
  onSaved,
  onSubmitDocs,
  selectedCount = 0,
}: {
  /** 있으면 수정 */
  editJobId?: string | null;
  onClose: () => void;
  onSaved: () => Promise<unknown> | void;
  onSubmitDocs: () => void;
  /** 수정할 때 이미 채운 인원 = 선택 + 수락한 제안(모집 인원은 이보다 줄일 수 없다) */
  selectedCount?: number;
}) {
  const minHeadcount = editJobId ? selectedCount : 0;
  const submitting = useRef(false);
  const today = todayKst();
  const editing = Boolean(editJobId);
  const [step, setStep] = useState<"type" | "fields" | "preview">(editing ? "fields" : "type");
  const [type, setType] = useState<JobType | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [deadlineTouched, setDeadlineTouched] = useState(editing);
  const [centerName, setCenterName] = useState("");
  const [gate, setGate] = useState<{ rules: RequirementRule[]; verified: DocType[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [original, setOriginal] = useState<JobSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    (async () => {
      try {
        const [rules, docs, profile, detail] = await Promise.all([
          fetchRequirementRules(),
          fetchMyDocuments(),
          fetchMyCenterProfile(),
          editJobId ? getJobDetail(editJobId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const verified = (Object.keys(DOC_TYPES) as DocType[]).filter((t) => effectiveDoc(docs, t, today));
        setGate({ rules, verified });
        setCenterName(profile?.centerName ?? "");
        if (editJobId) {
          if (!detail) throw new Error("not found");
          setOriginal(detail);
          setType(detail.jobType);
          setD({
            title: detail.title,
            region: detail.region,
            venue: detail.venue ?? "",
            classDate: detail.classDate ?? "",
            startTime: sliceTime(detail.startTime),
            endTime: sliceTime(detail.endTime),
            workDays: detail.workDays,
            workTime: detail.workTime ?? "",
            tourStart: detail.tourStart ?? "",
            tourEnd: detail.tourEnd ?? "",
            destination: detail.destination ?? "",
            destinationKind: detail.destinationKind ?? "domestic",
            coversFlight: detail.coversFlight ?? false,
            coversLodging: detail.coversLodging ?? false,
            negotiable: detail.payAmount == null,
            payAmount: detail.payAmount == null ? "" : String(detail.payAmount),
            payUnit: detail.payUnit ?? "per_class",
            headcount: String(detail.headcount),
            requirementTags: detail.requirementTags,
            description: detail.description,
            deadline: detail.deadline,
          });
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, editJobId]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggleIn = (k: "workDays" | "requirementTags", v: string) =>
    setD((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));

  // 일정을 바꾸면 마감일 기본값을 따라가고, 사용자가 직접 고른 뒤에는 건드리지 않는다.
  useEffect(() => {
    if (deadlineTouched || !type) return;
    setD((p) => ({ ...p, deadline: defaultDeadline(type, { classDate: p.classDate || null, tourStart: p.tourStart || null }, today) }));
  }, [type, d.classDate, d.tourStart, deadlineTouched, today]);

  // 마감일 상한: 오늘+90일, 수업·투어는 일정 시작일까지(서버 007과 같은 한도)
  const startDate = type === "lesson" ? d.classDate : type === "tour" ? d.tourStart : "";
  const deadlineMax = startDate && startDate < maxDeadline(today) ? startDate : maxDeadline(today);

  const missing = (t: JobType): DocType[] => (gate ? missingForJobType(gate.verified, gate.rules, t) : []);

  const previewJob = useMemo<JobSummary | null>(() => {
    if (!type) return null;
    const i = draftToInput(type, d);
    return {
      id: "preview",
      ownerId: "",
      centerId: "",
      centerName: centerName || "내 센터",
      jobType: type,
      title: i.title,
      region: i.region,
      venue: i.venue ?? null,
      classDate: i.classDate ?? null,
      startTime: i.startTime ?? null,
      endTime: i.endTime ?? null,
      workDays: i.workDays ?? [],
      workTime: i.workTime ?? null,
      tourStart: i.tourStart ?? null,
      tourEnd: i.tourEnd ?? null,
      destination: i.destination ?? null,
      destinationKind: i.destinationKind ?? null,
      coversFlight: i.coversFlight ?? null,
      coversLodging: i.coversLodging ?? null,
      payAmount: i.payAmount ?? null,
      payUnit: i.payUnit ?? null,
      headcount: i.headcount,
      remaining: i.headcount,
      requirementTags: i.requirementTags ?? [],
      deadline: i.deadline,
      viewCount: original?.viewCount ?? 0,
      createdAt: original?.createdAt ?? new Date().toISOString(),
      editedAt: original ? new Date().toISOString() : null,
      status: "open",
    };
  }, [type, d, centerName, original]);

  const back = () => {
    if (step === "preview") setStep("fields");
    else if (step === "fields" && !editing) setStep("type");
    else onClose();
  };

  const toPreview = () => {
    if (!type) return;
    const msg = validateDraft(type, d, today, minHeadcount);
    if (msg) {
      toast.error(msg);
      return;
    }
    setStep("preview");
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    if (!type || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    const input = draftToInput(type, d);
    const res = editJobId ? await updateJob(editJobId, input) : await createJob(input);
    if (res.error) {
      submitting.current = false;
      setBusy(false);
      toast.error(res.error);
      return;
    }
    toast.success(editJobId ? "공고를 수정했어요" : "공고를 올렸어요");
    try {
      await onSaved();
    } finally {
      onClose(); // 닫을 때까지 busy 유지 — 중복 등록 방지
    }
  };

  const header = (
    <div className="mb-5 flex items-center gap-2">
      <button type="button" aria-label="뒤로" onClick={back} className="-ml-2 flex size-11 items-center justify-center text-ink">
        <ArrowLeft className="size-6" />
      </button>
      <h1 className="text-xl font-bold text-ink">
        {editing ? "공고 수정" : step === "type" ? "어떤 공고를 올릴까요" : step === "fields" ? `${JOB_TYPES[type!].label}` : "이렇게 보여요"}
      </h1>
    </div>
  );

  if (loadError || !gate || (editing && !type)) {
    return (
      <div>
        {header}
        {loadError ? (
          <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
            불러오지 못했어요
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold text-ink underline">
              다시 시도
            </button>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>
        )}
      </div>
    );
  }

  if (step === "type") {
    return (
      <div>
        {header}
        <div className="space-y-3">
          {(Object.keys(JOB_TYPES) as JobType[]).map((t) => {
            const miss = missing(t);
            const locked = miss.length > 0;
            return (
              <div key={t} className={`rounded-card p-5 shadow-sm ${locked ? "bg-surface" : "bg-white"}`}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setType(t);
                    setStep("fields");
                  }}
                  className="block w-full text-left disabled:cursor-not-allowed"
                >
                  <div className={`flex items-center gap-2 text-lg font-bold ${locked ? "text-muted" : "text-ink"}`}>
                    {locked && <Lock className="size-4" />}
                    {JOB_TYPES[t].label}
                  </div>
                  <p className="mt-1 text-sm text-muted">{TYPE_DESC[t]}</p>
                </button>
                {locked && (
                  <div className="mt-3 rounded-xl bg-warn-bg p-3">
                    <p className="text-sm font-medium text-ink">
                      {withJosa(miss.map((m) => DOC_TYPES[m].label).join("·"))} 확인되면 올릴 수 있어요
                    </p>
                    <Button className="mt-3 h-11 w-full bg-ink text-base text-white" onClick={onSubmitDocs}>
                      서류 제출하기
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!type) return null;

  if (step === "preview" && previewJob) {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-sm text-muted">강사에게 이렇게 보여요. 올리기 전에 확인해 주세요.</p>
        <JobCard job={previewJob} />
        <section className="rounded-card bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">상세 설명</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{d.description}</p>
          <p className="mt-3 text-xs text-muted">모집 {d.headcount}명 · 마감일 {d.deadline}</p>
        </section>
        <div className="h-24" />
        <StickyBar>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-[52px] border-line text-base" disabled={busy} onClick={() => setStep("fields")}>
              고치기
            </Button>
            <Button className="h-[52px] bg-ink text-base text-white" disabled={busy} onClick={() => void submit()}>
              {busy ? "올리는 중…" : editing ? "수정하기" : "올리기"}
            </Button>
          </div>
        </StickyBar>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      {header}

      <Field label="제목">
        <Input value={d.title} maxLength={60} placeholder="예: 토요일 입문 수업 강사님 구해요" onChange={(e) => set("title", e.target.value)} />
      </Field>

      <Field label="지역">
        <div className="flex flex-wrap gap-2">
          {REGION_OPTIONS.map((r) => (
            <Chip key={r} selected={d.region === r} onClick={() => set("region", r)}>
              {r}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="장소" hint="(선택)">
        <Input value={d.venue} maxLength={60} placeholder="예: 잠실 수영장" onChange={(e) => set("venue", e.target.value)} />
      </Field>

      {type === "lesson" && (
        <Field label="수업 일정">
          <div className="space-y-2">
            <Input type="date" min={today} value={d.classDate} onChange={(e) => set("classDate", e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="time" aria-label="시작 시간" value={d.startTime} onChange={(e) => set("startTime", e.target.value)} />
              <Input type="time" aria-label="끝나는 시간" value={d.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </div>
          </div>
        </Field>
      )}

      {type === "affiliation" && (
        <>
          <Field label="근무 요일">
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => (
                <Chip key={day} selected={d.workDays.includes(day)} onClick={() => toggleIn("workDays", day)}>
                  {day}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="근무 시간" hint="(선택)">
            <Input value={d.workTime} maxLength={40} placeholder="예: 10:00–18:00" onChange={(e) => set("workTime", e.target.value)} />
          </Field>
        </>
      )}

      {type === "tour" && (
        <>
          <Field label="투어 일정">
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" aria-label="출발일" min={today} value={d.tourStart} onChange={(e) => set("tourStart", e.target.value)} />
              <Input type="date" aria-label="도착일" min={d.tourStart || today} value={d.tourEnd} onChange={(e) => set("tourEnd", e.target.value)} />
            </div>
          </Field>
          <Field label="여행지">
            <Input value={d.destination} maxLength={40} placeholder="예: 세부" onChange={(e) => set("destination", e.target.value)} />
            <div className="mt-2 flex gap-2">
              <Chip selected={d.destinationKind === "domestic"} onClick={() => set("destinationKind", "domestic")}>
                국내
              </Chip>
              <Chip selected={d.destinationKind === "overseas"} onClick={() => set("destinationKind", "overseas")}>
                해외
              </Chip>
            </div>
          </Field>
          <Field label="센터가 부담하는 것" hint="(선택)">
            <div className="flex gap-2">
              <Chip selected={d.coversFlight} onClick={() => setD((p) => ({ ...p, coversFlight: !p.coversFlight }))}>
                항공
              </Chip>
              <Chip selected={d.coversLodging} onClick={() => setD((p) => ({ ...p, coversLodging: !p.coversLodging }))}>
                숙박
              </Chip>
            </div>
          </Field>
        </>
      )}

      <Field label="단가">
        <div className="flex gap-2">
          <Chip selected={d.negotiable} onClick={() => set("negotiable", true)}>
            협의
          </Chip>
          <Chip selected={!d.negotiable} onClick={() => set("negotiable", false)}>
            금액 입력
          </Chip>
        </div>
        {!d.negotiable && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PAY_UNITS) as PayUnit[]).map((u) => (
                <Chip key={u} selected={d.payUnit === u} onClick={() => set("payUnit", u)}>
                  {PAY_UNITS[u]}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                inputMode="numeric"
                value={d.payAmount}
                placeholder="예: 80000"
                onChange={(e) => set("payAmount", e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
              />
              <span className="text-base text-ink">원</span>
            </div>
          </div>
        )}
      </Field>

      <Field label="모집 인원" hint={minHeadcount > 0 ? `(${minHeadcount}~20명 · 선택·제안 수락 인원과 같아지면 공고가 마감돼요)` : "(1~20명)"}>
        <Input inputMode="numeric" value={d.headcount} onChange={(e) => set("headcount", e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} />
      </Field>

      <Field label="자격 조건" hint="(선택, 여러 개 가능)">
        <div className="flex flex-wrap gap-2">
          {REQUIREMENT_TAGS.map((t) => (
            <Chip key={t} selected={d.requirementTags.includes(t)} onClick={() => toggleIn("requirementTags", t)}>
              {t}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="상세 설명">
        <Textarea
          rows={6}
          maxLength={2000}
          value={d.description}
          placeholder="수업 내용, 준비물, 이동 방법 등을 적어 주세요"
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <Field label="지원 마감일">
        <Input
          type="date"
          min={today}
          max={deadlineMax}
          value={d.deadline}
          onChange={(e) => {
            setDeadlineTouched(true);
            set("deadline", e.target.value);
          }}
        />
      </Field>

      <div className="h-24" />
      <StickyBar>
        <Button className="h-[52px] w-full bg-ink text-base text-white" onClick={toPreview}>
          미리보기
        </Button>
      </StickyBar>
    </div>
  );
}
