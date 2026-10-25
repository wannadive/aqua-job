"use client";

import { avatarUrl } from "@/lib/avatar/api";
import { initialOf } from "@/lib/offers/logic";
import type { BrowseInstructor } from "@/lib/offers/types";
import { SCOPE_OPTIONS } from "@/lib/talent-profile/config";
import { formatCert } from "@/lib/talent-profile/logic";
import { DOC_TYPES } from "@/lib/verification/config";
import { publicFacts } from "@/lib/verification/effective";
import { todayKst } from "@/lib/verification/logic";
import { Button } from "@/components/ui/button";

/** 사진(있으면) 또는 이름 첫 글자 */
export function InstructorAvatar({ name, photoPath, size = 56 }: { name: string; photoPath: string | null; size?: number }) {
  const url = avatarUrl(photoPath);
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <div style={style} className="flex shrink-0 items-center justify-center rounded-full bg-ok-bg text-xl font-bold text-ok" aria-hidden>
      {initialOf(name)}
    </div>
  );
}

/**
 * 강사 찾기 카드. browse_instructors가 준 공개 칸 + 유효한 서류 사실만 그린다(연락처 칸 없음).
 * 서류는 사실 문구로만(factLabel). 본인 입력 값은 "(본인 입력)"으로 구분.
 */
export function InstructorCard({
  instructor: t,
  offeredCount,
  onOpen,
  onOffer,
  offerDisabled = false,
}: {
  instructor: BrowseInstructor;
  /** 이 강사에게 내가 보낸 제안 수(모든 공고) */
  offeredCount: number;
  onOpen: () => void;
  onOffer: () => void;
  /** 내 공고를 아직 못 읽었을 때 등 */
  offerDisabled?: boolean;
}) {
  const facts = publicFacts(t.facts, todayKst()).filter((f) => DOC_TYPES[f.type].owner === "instructor");
  const basics = [t.gender, t.ageBand].filter(Boolean).join(" · ");
  const certs = t.certifications.filter((c) => c.org || c.level).map(formatCert);
  const career = [t.instructorLevel, t.instructorYears != null ? `강사 경력 ${t.instructorYears}년` : null, certs.join(", ")]
    .filter((x) => x && x.length > 0)
    .join(" · ");
  const scopes = t.scopes.map((s) => SCOPE_OPTIONS.find((o) => o.value === s)?.label ?? s);
  const where = [t.regions.join("·"), scopes.join("·")].filter((x) => x.length > 0).join(" / ");

  return (
    <article className="rounded-card bg-white p-5 shadow-sm">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 text-left">
        <InstructorAvatar name={t.displayName} photoPath={t.photoPath} />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-ink">{t.displayName || "강사"}</h3>
          {basics && <p className="text-sm text-muted">{basics}</p>}
        </div>
        {offeredCount > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink">제안함 {offeredCount}</span>
        )}
      </button>

      {career && (
        <p className="mt-3 text-sm font-medium text-ink">
          {career}
          <span className="ml-1 text-xs font-normal text-muted">(본인 입력)</span>
        </p>
      )}
      {where && <p className="mt-1 text-sm text-muted">{where}</p>}
      {t.availableDays.length > 0 && <p className="mt-1 text-sm text-muted">가능 요일 {t.availableDays.join("·")}</p>}

      {facts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
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
      {t.teachingStyleTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {t.teachingStyleTags.map((tag) => (
            <span key={tag} className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink">
              {tag}
            </span>
          ))}
        </div>
      )}
      {t.intro && <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink">{t.intro}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11 border-line text-base" onClick={onOpen}>
          이력서 보기
        </Button>
        <Button className="h-11 bg-ink text-base text-white" disabled={offerDisabled} onClick={onOffer}>
          제안하기
        </Button>
      </div>
    </article>
  );
}
