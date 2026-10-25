"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApplicantResume } from "@/components/jobs/applicant-resume";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { JobSummary } from "@/lib/jobs/types";
import { browseInstructors } from "@/lib/offers/api";
import { BROWSE_PAGE_SIZE, EMPTY_INSTRUCTOR_FILTERS, buildBrowseFilters } from "@/lib/offers/logic";
import type { BrowseInstructor, InstructorFilterState, Offer } from "@/lib/offers/types";
import { CERT_ORG_OPTIONS, DAY_OPTIONS, REGION_OPTIONS, SCOPE_OPTIONS } from "@/lib/talent-profile/config";
import { InstructorCard } from "./instructor-card";
import { OfferComposer } from "./offer-composer";
import { SentOffers } from "./sent-offers";
import { useNavigableValue } from "@/lib/navigation/use-navigable";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full px-4 text-sm font-semibold ${on ? "bg-ink text-white" : "bg-white text-ink shadow-sm"}`}
    >
      {children}
    </button>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function FilterPanel({ value, onApply }: { value: InstructorFilterState; onApply: (v: InstructorFilterState) => void }) {
  const [d, setD] = useState<InstructorFilterState>(value);
  useEffect(() => setD(value), [value]);
  return (
    <section className="space-y-4 rounded-card bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-ink">지역</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {REGION_OPTIONS.map((r) => (
            <Chip key={r} on={d.regions.includes(r)} onClick={() => setD({ ...d, regions: toggle(d.regions, r) })}>
              {r}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">자격 단체·등급</p>
        <div className="mt-2 flex gap-2">
          <select
            aria-label="자격 단체"
            value={d.org ?? ""}
            onChange={(e) => setD({ ...d, org: e.target.value || null })}
            className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink"
          >
            <option value="">전체 단체</option>
            {CERT_ORG_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <Input
            aria-label="등급"
            value={d.level}
            maxLength={30}
            onChange={(e) => setD({ ...d, level: e.target.value })}
            placeholder="등급(예: 강사)"
            className="h-11 text-base"
          />
        </div>
        <p className="mt-1 text-xs text-muted">등급은 강사가 적은 글자와 똑같을 때만 찾아요</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">활동 범위</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip on={d.scope === null} onClick={() => setD({ ...d, scope: null })}>
            전체
          </Chip>
          {SCOPE_OPTIONS.map((s) => (
            <Chip key={s.value} on={d.scope === s.value} onClick={() => setD({ ...d, scope: s.value })}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">가능 요일</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAY_OPTIONS.map((day) => (
            <Chip key={day} on={d.availableDays.includes(day)} onClick={() => setD({ ...d, availableDays: toggle(d.availableDays, day) })}>
              {day}
            </Chip>
          ))}
        </div>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={d.verifiedOnly}
          onChange={(e) => setD({ ...d, verifiedOnly: e.target.checked })}
          className="size-5 accent-[#0AA88E]"
        />
        강사 자격증 서류가 확인된 강사만
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11 border-line text-base" onClick={() => onApply(EMPTY_INSTRUCTOR_FILTERS)}>
          초기화
        </Button>
        <Button className="h-11 bg-ink text-base text-white" onClick={() => onApply(d)}>
          이 조건으로 찾기
        </Button>
      </div>
    </section>
  );
}

/**
 * 센터 [강사 찾기] 탭: 찾기(필터 → 카드 → 이력서 → 공고 골라서 제안하기) · 보낸 제안.
 * 둘러보기·제안 권한은 서버(browse_instructors · send_offer)가 정한다 — 거부하면 그 문구를 그대로 보여 준다.
 */
export function InstructorFinder({
  jobs,
  jobsLoading,
  jobsError,
  onRetryJobs,
  offers,
  offersLoading,
  offersError,
  reloadOffers,
  reloadJobs,
  onNewJob,
  onApplicants,
  viewerId = null,
}: {
  /** 지금 로그인한 (활성) 회원 id — 이력서 [신고하기]에만 쓴다 */
  viewerId?: string | null;
  jobs: JobSummary[];
  jobsLoading: boolean;
  jobsError: boolean;
  onRetryJobs: () => void;
  offers: Offer[];
  offersLoading: boolean;
  offersError: boolean;
  reloadOffers: () => Promise<unknown>;
  reloadJobs: () => Promise<unknown>;
  onNewJob: () => void;
  onApplicants: (jobId: string) => void;
}) {
  const [view, setView] = useState<"find" | "sent">("find");
  const [filters, setFilters] = useState<InstructorFilterState>(EMPTY_INSTRUCTOR_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<BrowseInstructor[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  // 강사 이력서(덮는 화면): 방문 기록 한 칸 — 폰 뒤로가기·[뒤로]가 같은 길로 닫는다
  const [resumeOf, setResumeOf] = useNavigableValue<{ id: string; name: string }>("v_talent");
  const [composing, setComposing] = useState<{ id: string; name: string } | null>(null);

  // 첫 쪽: 필터가 바뀌거나 다시 시도하면 처음부터
  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    browseInstructors(filters, 0)
      .then((list) => {
        if (my !== seq.current) return;
        setItems(list);
        setHasMore(list.length === BROWSE_PAGE_SIZE);
      })
      .catch((e) => {
        if (my === seq.current) setError(e instanceof Error ? e.message : "강사 목록을 불러오지 못했어요");
      })
      .finally(() => {
        if (my === seq.current) setLoading(false);
      });
  }, [filters, attempt]);

  const loadMore = async () => {
    if (loadingMore) return;
    const my = seq.current;
    setLoadingMore(true);
    try {
      const list = await browseInstructors(filters, items.length);
      if (my !== seq.current) return;
      // 그 사이 순서가 바뀌어 겹친 사람은 한 번만
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.userId));
        return [...prev, ...list.filter((p) => !seen.has(p.userId))];
      });
      setHasMore(list.length === BROWSE_PAGE_SIZE);
    } catch (e) {
      // 이미 보이는 목록은 그대로 두고 알리기만
      if (my === seq.current) toast.error(e instanceof Error ? e.message : "강사 목록을 더 불러오지 못했어요");
    } finally {
      setLoadingMore(false);
    }
  };

  const refreshAfterRefusal = useCallback(() => Promise.all([reloadJobs(), reloadOffers()]), [reloadJobs, reloadOffers]);

  // 내 공고·보낸 제안을 읽기 전·실패 때는 제안 버튼을 막는다(한도·중복 안내 숫자가 틀리지 않게). 서버가 최종 판단.
  const offerBlocked = jobsLoading || jobsError || offersLoading || offersError;
  const offersNote = offersError && !jobsError && (
    <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
      보낸 제안을 불러오지 못해 지금은 제안할 수 없어요
      <button type="button" onClick={() => void reloadOffers()} className="font-semibold text-ink underline">
        다시 시도
      </button>
    </div>
  );
  const offeredTo = (id: string) => offers.filter((o) => o.instructorId === id).length;
  const activeFilterCount = Object.keys(buildBrowseFilters(filters)).length;

  const composer = (
    <OfferComposer
      instructor={composing}
      jobs={jobs}
      offers={offers}
      offersUnavailable={offerBlocked}
      onRetryOffers={() => void (jobsError ? onRetryJobs() : reloadOffers())}
      onClose={() => setComposing(null)}
      onSent={reloadOffers}
      onRefresh={refreshAfterRefusal}
      onNewJob={() => {
        setComposing(null);
        onNewJob();
      }}
    />
  );

  if (resumeOf) {
    return (
      <>
        <ApplicantResume
          instructorId={resumeOf.id}
          name={resumeOf.name}
          onBack={() => setResumeOf(null)}
          reporterId={viewerId}
          actions={
            <>
              {offersNote}
              <Button
                className="h-[52px] w-full bg-ink text-base text-white"
                disabled={offerBlocked}
                onClick={() => setComposing(resumeOf)}
              >
                공고 골라서 제안하기
              </Button>
            </>
          }
        />
        {composer}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">강사 찾기</h1>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
        {(["find", "sent"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            aria-pressed={view === k}
            className={`min-h-11 rounded-lg text-sm font-semibold ${view === k ? "bg-white text-ink shadow-sm" : "text-muted"}`}
          >
            {k === "find" ? "찾기" : `보낸 제안 ${offers.length}`}
          </button>
        ))}
      </div>

      {jobsError && (
        <div className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-sm text-muted shadow-sm">
          내 공고를 불러오지 못했어요
          <button type="button" onClick={onRetryJobs} className="font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      )}

      {view === "sent" ? (
        <SentOffers
          offers={offers}
          jobs={jobs}
          loading={jobsLoading || (offersLoading && !jobsError)}
          error={offersError || jobsError}
          onRetry={() => (jobsError ? onRetryJobs() : void reloadOffers())}
          onResume={(o) => setResumeOf({ id: o.instructorId, name: o.instructorName ?? "강사" })}
          onApplicants={onApplicants}
          onChanged={reloadOffers}
        />
      ) : (
        <>
          <Button variant="outline" className="h-11 w-full border-line text-base" onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? "필터 닫기" : `필터${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}`}
          </Button>
          {showFilters && (
            <FilterPanel
              value={filters}
              onApply={(v) => {
                setFilters(v);
                setShowFilters(false);
              }}
            />
          )}

          {offersNote}
          {loading && <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>}
          {!loading && error && (
            <div className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
              <p>{error}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 flex h-11 items-center font-semibold text-ink underline">
                다시 시도
              </button>
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              {activeFilterCount > 0 ? "이 조건에 맞는 강사가 없어요. 필터를 줄여 보세요" : "아직 이력서를 공개한 강사가 없어요"}
            </p>
          )}
          {!loading &&
            !error &&
            items.map((t) => (
              <InstructorCard
                key={t.userId}
                instructor={t}
                offeredCount={offeredTo(t.userId)}
                offerDisabled={offerBlocked}
                onOpen={() => setResumeOf({ id: t.userId, name: t.displayName || "강사" })}
                onOffer={() => setComposing({ id: t.userId, name: t.displayName || "강사" })}
              />
            ))}
          {!loading && !error && hasMore && (
            <Button variant="outline" className="h-11 w-full border-line text-base" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "불러오는 중…" : "더 보기"}
            </Button>
          )}
        </>
      )}

      {composer}
    </div>
  );
}
