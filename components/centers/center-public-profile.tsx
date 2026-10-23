"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { JOB_STATUS_LABEL } from "@/components/jobs/job-card";
import { avatarUrl } from "@/lib/avatar/api";
import { getCenterPublicProfile, getPublicFacts, listCenterJobHistory } from "@/lib/jobs/api";
import { JOB_TYPES } from "@/lib/jobs/config";
import { formatMdKst, formatPay } from "@/lib/jobs/logic";
import type { CenterJobHistoryItem, CenterPublicProfile } from "@/lib/jobs/types";
import { DOC_TYPES } from "@/lib/verification/config";
import { publicFacts, type PublicFact } from "@/lib/verification/effective";
import { todayKst } from "@/lib/verification/logic";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-20 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
    </div>
  );
}

/** 센터 공개 프로필. centerId = centers.id. 상세 칸은 서버가 detailVisible일 때만 채워 준다. */
export function CenterPublicProfileView({
  centerId,
  onBack,
  onOpenJob,
  onSignup,
  loggedIn,
}: {
  centerId: string;
  onBack?: () => void;
  onOpenJob?: (jobId: string) => void;
  onSignup: () => void;
  loggedIn: boolean;
}) {
  const [profile, setProfile] = useState<CenterPublicProfile | null | undefined>(undefined);
  const [facts, setFacts] = useState<PublicFact[]>([]);
  const [history, setHistory] = useState<CenterJobHistoryItem[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setProfile(undefined);
    setError(false);
    (async () => {
      try {
        const p = await getCenterPublicProfile(centerId);
        if (cancelled) return;
        setProfile(p);
        if (!p) return;
        const [docs, hist] = await Promise.all([getPublicFacts(p.userId), listCenterJobHistory(centerId)]);
        if (cancelled) return;
        // 센터 서류만 사실로 보여 준다(주인이 강사 역할도 가진 경우 강사 서류는 제외)
        setFacts(publicFacts(docs, todayKst()).filter((f) => DOC_TYPES[f.type].owner === "center"));
        setHistory(hist);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [centerId, attempt]);

  const back = onBack && (
    <button type="button" onClick={onBack} className="-ml-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold text-ink">
      <ChevronLeft className="size-5" /> 뒤로
    </button>
  );

  if (error)
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
          센터 정보를 불러오지 못했어요
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
        <div className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">찾을 수 없는 센터예요</div>
      </div>
    );

  const photos = profile.photoPaths.map((p) => avatarUrl(p)).filter((u): u is string => !!u);

  return (
    <div className="space-y-4">
      {back}
      <h1 className="text-[26px] font-bold tracking-tight text-ink">{profile.centerName}</h1>

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-ink">센터 소개</h2>
        <dl className="mt-3 space-y-2">
          <Row label="주 교육 장소" value={profile.venues.join(", ")} />
          <Row label="교육 요일" value={profile.teachingDays.join("·")} />
          <Row label="교육 시간대" value={profile.teachingTime} />
        </dl>
        {photos.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {photos.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="" className="aspect-square w-full rounded-xl object-cover" />
            ))}
          </div>
        )}
        {facts.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span
                key={f.type}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${f.tone === "warn" ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok"}`}
              >
                {f.label}
              </span>
            ))}
          </div>
        )}
      </section>

      {profile.detailVisible ? (
        <section className="rounded-card bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-ink">센터 상세</h2>
          <dl className="mt-3 space-y-2">
            <Row label="대표자" value={profile.representativeName} />
            <Row label="대표 강사" value={profile.headInstructor} />
            <Row label="소속 강사" value={profile.instructorCount != null ? `${profile.instructorCount}명` : null} />
            <Row label="월 교육생" value={profile.monthlyStudents != null ? `${profile.monthlyStudents}명` : null} />
            <Row label="주소" value={profile.address} />
          </dl>
        </section>
      ) : (
        <section className="rounded-card bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">센터 상세</h2>
            {loggedIn ? (
              <span className="rounded-full bg-warn-bg px-3 py-1.5 text-xs font-semibold text-warn">구독하고 보기</span>
            ) : (
              <button type="button" onClick={onSignup} className="rounded-full bg-warn-bg px-3 py-1.5 text-xs font-semibold text-warn">
                가입하고 보기
              </button>
            )}
          </div>
          <div className="mt-3 space-y-2" aria-hidden="true">
            <div className="h-3 w-[90%] rounded-full bg-surface" />
            <div className="h-3 w-[70%] rounded-full bg-surface" />
          </div>
        </section>
      )}

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-ink">공고 이력</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted">올린 공고가 아직 없어요</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {history.map((h) => {
              const body = (
                <>
                  <span className="block text-sm font-semibold text-ink">{h.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {JOB_TYPES[h.jobType].short} · {formatPay(h.payAmount, h.payUnit)} · {formatMdKst(h.createdAt)} 등록 ·{" "}
                    {JOB_STATUS_LABEL[h.status]}
                  </span>
                </>
              );
              return (
                <li key={h.id}>
                  {onOpenJob ? (
                    <button type="button" onClick={() => onOpenJob(h.id)} className="block w-full py-3 text-left">
                      {body}
                    </button>
                  ) : (
                    <div className="py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
