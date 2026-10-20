import { DOC_TYPES, EXPIRING_DAYS } from "./config.ts";
import type { DocDisplayStatus, DocRecord, DocType } from "./types.ts";

/** YYYY-MM-DD에 일수를 더한다. 시간대 변환 없이 UTC 달력 계산만 쓴다. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** today는 호출자가 KST 기준 YYYY-MM-DD로 넘긴다. */
export function displayStatus(doc: DocRecord | undefined, today: string): DocDisplayStatus {
  if (!doc) return "missing";
  if (doc.status === "submitted") return "submitted";
  if (doc.status === "rejected") return "rejected";
  if (doc.validUntil === null) return "verified";
  if (doc.validUntil < today) return "expired";
  if (doc.validUntil <= addDays(today, EXPIRING_DAYS)) return "expiring";
  return "verified";
}

export function latestByType(docs: DocRecord[]): Partial<Record<DocType, DocRecord>> {
  const out: Partial<Record<DocType, DocRecord>> = {};
  for (const d of docs) {
    const cur = out[d.docType];
    if (!cur || d.submittedAt > cur.submittedAt) out[d.docType] = d;
  }
  return out;
}

/** 서류 이름 앞부분. 자격증은 "{단체} {등급} 자격증", 그 외는 meta를 앞에 붙인다. */
function headLabel(type: DocType, label: string, org?: string, grade?: string): string {
  if (!org && !grade) return label;
  if (type === "instructor_cert" || type === "rep_instructor_cert") {
    const core = [org, grade ?? "강사", "자격증"].filter(Boolean).join(" ");
    return type === "rep_instructor_cert" ? `대표강사 ${core}` : core;
  }
  return [org, grade, label].filter(Boolean).join(" ");
}

/** 사실만 보여 준다. 보증·추천 표현은 쓰지 않는다. */
export function factLabel(doc: DocRecord, today: string): string {
  const { org, grade } = doc.meta;
  const base = DOC_TYPES[doc.docType].label;
  const head = headLabel(doc.docType, base, org, grade);
  const status = displayStatus(doc, today);
  switch (status) {
    case "submitted":
      return `${head} · 확인 대기`;
    case "rejected":
      return `${head} · 반려됨`;
    case "expired":
      return `${head} · 만료됨`;
    case "verified":
    case "expiring":
      return doc.validUntil
        ? `${head} · ${doc.validUntil.slice(0, 4)}.${doc.validUntil.slice(5, 7)}까지`
        : `${head} · 확인됨`;
    default:
      return head;
  }
}

export function missingRequirements(verified: DocType[], required: DocType[]): DocType[] {
  return required.filter((t) => !verified.includes(t));
}
