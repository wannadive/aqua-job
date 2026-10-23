import { DOC_TYPES, LEGACY_VERIFICATION_BUCKET, VERIFICATION_BUCKET } from "./config.ts";
import type { DocReviewStatus } from "./types.ts";

type ReviewRow = { id: string; ownerId: string; docType: string; status: DocReviewStatus; submittedAt: string };

/**
 * 확인 대기열에 띄울 건만 고른다(오래된 순).
 * 확인 대기 중에도 다시 올릴 수 있어서 같은 사람·같은 종류의 대기 건이 여러 개일 수 있다.
 * 그 사람·종류에서 가장 최근에 낸 건이 '확인 대기'일 때만 그 건을 보여 주고, 나머지는 새 서류로 바뀐 것으로 본다.
 * rows에는 대기 건뿐 아니라 같은 사람의 처리된 건도 넣어야 "더 최근 건이 이미 처리됨"을 가려낼 수 있다.
 */
export function latestPendingPerOwnerType<T extends ReviewRow>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const d of rows) {
    const key = `${d.ownerId}\u0000${d.docType}`;
    const cur = latest.get(key);
    if (!cur || compareSubmission(d, cur) > 0) latest.set(key, d);
  }
  return [...latest.values()].filter((d) => d.status === "submitted").sort(compareSubmission);
}

/** 제출 시각 순, 같으면 id 순(결과가 입력 순서에 따라 달라지지 않게). */
function compareSubmission(a: ReviewRow, b: ReviewRow): number {
  if (a.submittedAt !== b.submittedAt) return a.submittedAt < b.submittedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 확인 뒤 원본을 지워야 하는 서류 종류(신분증). */
export const PURGE_DOC_TYPES = (Object.keys(DOC_TYPES) as (keyof typeof DOC_TYPES)[]).filter(
  (t) => DOC_TYPES[t].deleteOriginalOnVerify,
);

export type PurgeDecision = "not_found" | "conflict" | "already_purged" | "purge";

/**
 * 원본 삭제 요청을 어떻게 처리할지. 원본 삭제 대상 종류(신분증)이면서
 * 확인됨·반려됨이거나, 확인 대기지만 같은 사람이 같은 종류를 더 최근에 다시 올린 건(superseded)일 때만 지운다.
 * superseded는 호출하는 쪽(서버)이 DB를 직접 보고 판단해 넘긴다(브라우저 말을 믿지 않는다).
 */
export function purgeDecision(
  doc: { status: string; docType: string; filePath: string | null } | null,
  opts: { superseded?: boolean } = {},
): PurgeDecision {
  if (!doc) return "not_found";
  const cfg = (DOC_TYPES as Record<string, { deleteOriginalOnVerify: boolean } | undefined>)[doc.docType];
  if (!cfg?.deleteOriginalOnVerify) return "conflict";
  const finished = doc.status === "verified" || doc.status === "rejected";
  const replaced = doc.status === "submitted" && opts.superseded === true;
  if (!finished && !replaced) return "conflict";
  if (!doc.filePath) return "already_purged";
  return "purge";
}

/**
 * doc보다 나중에 낸 같은 사람·같은 종류 서류가 있는지(제출 시각 순, 같으면 id 순 — 대기열과 같은 기준).
 * siblings에는 doc 자신이 들어 있어도 된다.
 */
export function isSuperseded(
  doc: { id: string; ownerId: string; docType: string; submittedAt: string },
  siblings: { id: string; ownerId: string; docType: string; submittedAt: string }[],
): boolean {
  return siblings.some(
    (s) =>
      s.id !== doc.id &&
      s.ownerId === doc.ownerId &&
      s.docType === doc.docType &&
      (s.submittedAt > doc.submittedAt || (s.submittedAt === doc.submittedAt && s.id > doc.id)),
  );
}

/** Storage 오류가 "파일이 없음"인지(본인이 확인 전에 지운 경우 등). */
export function isMissingObjectError(err: { message?: string; statusCode?: string | number } | null | undefined): boolean {
  if (!err) return false;
  if (String(err.statusCode ?? "") === "404") return true;
  return /not[\s_-]?found/i.test(err.message ?? "");
}

export const ROLE_LABEL = { instructor: "강사", center: "센터", admin: "관리자" } as const;

/** ISO 시각 → 한국 날짜 YYYY.MM.DD */
export function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10).replaceAll("-", ".");
}

/**
 * 서류 행의 bucket 칸 → 원본이 있는 Storage 버킷. 칸이 없으면(006 이전 응답) 옛 버킷,
 * 알 수 없는 값이면 null(서명 주소·삭제를 하지 않는다).
 */
export function docBucket(bucket: unknown): string | null {
  if (bucket === undefined || bucket === null) return LEGACY_VERIFICATION_BUCKET;
  if (bucket === VERIFICATION_BUCKET || bucket === LEGACY_VERIFICATION_BUCKET) return bucket;
  return null;
}
