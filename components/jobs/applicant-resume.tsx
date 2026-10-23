"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { avatarUrl } from "@/lib/avatar/api";
import { getPublicFacts } from "@/lib/jobs/api";
import { fetchTalentProfile } from "@/lib/talent-profile/api";
import { SCOPE_OPTIONS } from "@/lib/talent-profile/config";
import { formatRecords } from "@/lib/talent-profile/logic";
import type { InstructorProfile } from "@/lib/talent-profile/types";
import { DOC_TYPES } from "@/lib/verification/config";
import { publicFacts, type PublicFact } from "@/lib/verification/effective";
import { todayKst } from "@/lib/verification/logic";

const SELF = <span className="ml-1 text-xs font-normal text-muted">(본인 입력)</span>;

function Row({ label, value, self = false }: { label: string; value: ReactNode; self?: boolean }) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-24 shrink-0 text-muted">
        {label}
        {self && SELF}
      </dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">{value}</dd>
    </div>
  );
}

function Section({ title, self = false, children }: { title: string; self?: boolean; children: ReactNode }) {
  return (
    <section className="rounded-card bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-ink">
        {title}
        {self && SELF}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * 센터가 보는 지원자 이력서. 이력서 항목 + 서류는 유효한 사실(publicFacts)만.
 * 연락처는 여기서 다루지 않는다(연락처는 선택 뒤 연락처 카드에서만).
 */
export function ApplicantResume({
  instructorId,
  name,
  onBack,
  actions,
}: {
  instructorId: string;
  name: string;
  onBack: () => void;
  /** 이력서를 읽었을 때만 맨 아래에 보이는 버튼 영역(예: 강사 찾기의 [공고 골라서 제안하기]) */
  actions?: ReactNode;
}) {
  const [profile, setProfile] = useState<InstructorProfile | null | undefined>(undefined);
  const [facts, setFacts] = useState<PublicFact[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setProfile(undefined);
    setError(false);
    Promise.all([fetchTalentProfile(instructorId), getPublicFacts(instructorId)])
      .then(([p, docs]) => {
        if (cancelled) return;
        setProfile(p);
        setFacts(publicFacts(docs, todayKst()).filter((f) => DOC_TYPES[f.type].owner === "instructor"));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [instructorId, attempt]);

  const back = (
    <button type="button" onClick={onBack} className="-ml-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold text-ink">
      <ChevronLeft className="size-5" /> 뒤로
    </button>
  );

  if (error)
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
          이력서를 불러오지 못했어요
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="ml-3 font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      </div>
    );
  if (profile === undefined)
    return (
      <div className="space-y-4">
        {back}
        <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>
      </div>
    );
  if (profile === null)
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
          볼 수 있는 이력서가 없어요. 강사가 이력서를 비공개로 돌렸거나 이용이 멈췄을 수 있어요
        </div>
      </div>
    );

  const photo = avatarUrl(profile.photoPath);
  const scopes = profile.scopes.map((s) => SCOPE_OPTIONS.find((o) => o.value === s)?.label ?? s);
  const records = formatRecords(profile.records);
  const certs = profile.certifications.filter((c) => c.org || c.level).map((c) => [c.org, c.level].filter(Boolean).join(" "));
  const basics = [profile.gender, profile.ageBand].filter(Boolean).join(" · ");
  const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v != null && v !== "");
  const showBasic =
    has(profile.regions) ||
    has(scopes) ||
    has(profile.mbti) ||
    has(profile.intro) ||
    has(profile.teachingStyleTags) ||
    has(profile.teachingStyleNote);
  const showSpec = has(certs) || has(profile.instructorLevel) || records.length > 0;
  const showCareer =
    has(profile.instructorYears) ||
    has(profile.studentsTaught) ||
    has(profile.pastCenters) ||
    has(profile.tourExperience) ||
    has(profile.otherCerts) ||
    has(profile.languages);
  const availability = [profile.availableDays.join("·"), profile.availableTime].filter((x) => x && x.length > 0).join(" ");

  return (
    <div className="space-y-4">
      {back}

      <section className="flex items-center gap-4 rounded-card bg-white p-5 shadow-sm">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-20 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="size-20 shrink-0 rounded-full bg-surface" aria-hidden />
        )}
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{name}</h1>
          {basics && <p className="mt-1 text-sm text-muted">{basics}</p>}
        </div>
      </section>

      {facts.length > 0 && (
        <Section title="서류">
          <div className="flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span
                key={f.type}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${f.tone === "warn" ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok"}`}
              >
                {f.label}
              </span>
            ))}
          </div>
        </Section>
      )}

      {showBasic && (
        <Section title="기본">
          <dl className="space-y-2">
            <Row label="활동 지역" value={profile.regions.join(", ")} />
            <Row label="교육하는 곳" value={scopes.join(", ")} />
            <Row label="MBTI" value={profile.mbti} />
            <Row label="자기소개" value={profile.intro} self />
          </dl>
          {profile.teachingStyleTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.teachingStyleTags.map((t) => (
                <span key={t} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink">
                  {t}
                </span>
              ))}
            </div>
          )}
          {profile.teachingStyleNote && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{profile.teachingStyleNote}</p>}
        </Section>
      )}

      {showSpec && (
        <Section title="프리다이빙 스펙" self>
          <dl className="space-y-2">
            <Row label="자격 단체·등급" value={certs.join(", ")} />
            <Row label="강사 등급" value={profile.instructorLevel} />
          </dl>
          {records.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {records.map((r) => (
                <div key={r.label} className="rounded-xl bg-surface px-3 py-2">
                  <div className="text-xs text-muted">{r.label}</div>
                  <div className="text-base font-bold text-ink">{r.value}</div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {showCareer && (
        <Section title="경력" self>
          <dl className="space-y-2">
            <Row label="강사 경력" value={profile.instructorYears != null ? `${profile.instructorYears}년` : null} />
            <Row label="가르친 교육생" value={profile.studentsTaught != null ? `${profile.studentsTaught}명` : null} />
            <Row label="활동한 센터" value={profile.pastCenters.join(", ")} />
            <Row label="투어 경험" value={profile.tourExperience} />
            <Row label="그 밖의 자격" value={profile.otherCerts.join(", ")} />
            <Row label="언어" value={profile.languages.join(", ")} />
          </dl>
        </Section>
      )}

      <Section title="가능 조건">
        <dl className="space-y-2">
          <Row label="가능 요일·시간" value={availability} />
          <Row label="희망 단가" value={profile.desiredRate || "협의"} />
        </dl>
      </Section>

      {actions}
    </div>
  );
}
