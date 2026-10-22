import { DOC_TYPES } from "./config.ts";
import { displayStatus, factLabel } from "./logic.ts";
import type { DocRecord, DocType } from "./types.ts";

/**
 * "유효 서류": 그 종류의 확인된(verified) 서류 중 가장 최근 확인 건이고, 유효기간이 없거나 오늘(KST) 이상인 것.
 * 가장 최근 확인 건이 만료됐으면 없음(이전 확인 건으로 내려가지 않는다).
 * SQL public.effective_doc(004)과 같은 규칙이다. 순서: verified_at 최신 → submitted_at 최신.
 * 남에게 보이는 사실은 이것으로, 본인 화면의 진행 상태는 latestByType(최신 제출)으로 본다.
 */
export function effectiveDoc(docs: DocRecord[], type: DocType, today: string): DocRecord | undefined {
  let best: DocRecord | undefined;
  for (const d of docs) {
    if (d.docType !== type || d.status !== "verified") continue;
    if (!best || isNewerVerified(d, best)) best = d;
  }
  if (!best) return undefined;
  if (best.validUntil !== null && best.validUntil < today) return undefined;
  return best;
}

/** SQL의 order by verified_at desc nulls last, submitted_at desc 와 같다. */
function isNewerVerified(a: DocRecord, b: DocRecord): boolean {
  if (a.verifiedAt !== b.verifiedAt) {
    if (a.verifiedAt === null) return false;
    if (b.verifiedAt === null) return true;
    return a.verifiedAt > b.verifiedAt;
  }
  return a.submittedAt > b.submittedAt;
}

export interface PublicFact {
  type: DocType;
  label: string;
  /** ok = 확인됨, warn = 곧 만료(30일 이내) */
  tone: "ok" | "warn";
}

/** 남에게 보여 줄 사실 꼬리표. 유효 서류만 나오고, 반려·대기·만료는 보이지 않는다. DOC_TYPES 순서. */
export function publicFacts(docs: DocRecord[], today: string): PublicFact[] {
  const out: PublicFact[] = [];
  for (const type of Object.keys(DOC_TYPES) as DocType[]) {
    const doc = effectiveDoc(docs, type, today);
    if (!doc) continue;
    out.push({
      type,
      label: factLabel(doc, today),
      tone: displayStatus(doc, today) === "expiring" ? "warn" : "ok",
    });
  }
  return out;
}
