import { test } from "node:test";
import assert from "node:assert/strict";
import { DOC_TYPES } from "./config.ts";
import { displayStatus, latestByType, factLabel, missingRequirements } from "./logic.ts";
import type { DocRecord, DocType, DocReviewStatus } from "./types.ts";

function mk(over: Partial<DocRecord> = {}): DocRecord {
  return {
    id: "1",
    ownerId: "u",
    docType: "instructor_cert",
    status: "submitted",
    validUntil: null,
    meta: {},
    rejectReason: null,
    submittedAt: "2026-01-01T00:00:00Z",
    verifiedAt: null,
    ...over,
  };
}

test("displayStatus 경계: 오늘 만료일은 곧 만료(아직 만료 아님), 어제는 만료, 30일 이내는 곧 만료", () => {
  const base = { id: "1", ownerId: "u", docType: "instructor_cert", status: "verified", meta: {}, rejectReason: null, submittedAt: "2026-01-01", verifiedAt: "2026-01-02" } as const;
  assert.equal(displayStatus({ ...base, validUntil: "2026-10-21" }, "2026-10-21"), "expiring");
  assert.equal(displayStatus({ ...base, validUntil: "2026-10-20" }, "2026-10-21"), "expired");
  assert.equal(displayStatus({ ...base, validUntil: "2026-11-20" }, "2026-10-21"), "expiring");
  assert.equal(displayStatus({ ...base, validUntil: "2026-11-21" }, "2026-10-21"), "verified");
  assert.equal(displayStatus({ ...base, docType: "id_card", validUntil: null }, "2030-01-01"), "verified");
  assert.equal(displayStatus(undefined, "2026-10-21"), "missing");
  assert.equal(displayStatus({ ...base, status: "submitted", validUntil: null }, "2026-10-21"), "submitted");
  assert.equal(displayStatus({ ...base, status: "rejected", validUntil: null }, "2026-10-21"), "rejected");
});

test("latestByType: 반려 후 재제출하면 최신 제출 건이 대표", () => {
  const r = latestByType([
    mk({ id: "a", docType: "instructor_cert", status: "rejected", submittedAt: "2026-10-01T00:00:00Z" }),
    mk({ id: "b", docType: "instructor_cert", status: "submitted", submittedAt: "2026-10-05T00:00:00Z" }),
  ]);
  assert.equal(r.instructor_cert?.id, "b");
});

test("factLabel: 사실만, 보증 표현 없음", () => {
  const d = mk({ docType: "instructor_cert", status: "verified", validUntil: "2027-03-31", meta: { org: "AIDA", grade: "강사" } });
  assert.equal(factLabel(d, "2026-10-21"), "AIDA 강사 자격증 · 2027.03까지");
  assert.equal(factLabel({ ...d, validUntil: "2026-10-01" }, "2026-10-21"), "AIDA 강사 자격증 · 만료됨");
  assert.equal(factLabel(mk({ docType: "id_card", status: "verified", validUntil: null }), "2026-10-21"), "신분증 · 확인됨");
  for (const s of [factLabel(d, "2026-10-21")]) assert.doesNotMatch(s, /검증|보증|인증됨|추천/);
});

test("missingRequirements: 확인된 서류에 없는 요건만", () => {
  assert.deepEqual(missingRequirements(["business_registration"], ["business_registration", "travel_business"]), ["travel_business"]);
  assert.deepEqual(missingRequirements([], []), []);
});

test("factLabel: 자격증 머리말 규칙", () => {
  const v = { status: "verified" as const, validUntil: "2027-03-31" };
  const today = "2026-10-21";
  assert.equal(factLabel(mk({ ...v, docType: "instructor_cert", meta: { org: "AIDA" } }), today), "AIDA 강사 자격증 · 2027.03까지");
  assert.equal(factLabel(mk({ ...v, docType: "rep_instructor_cert", meta: { org: "AIDA", grade: "강사" } }), today), "대표강사 AIDA 강사 자격증 · 2027.03까지");
  for (const type of Object.keys(DOC_TYPES) as DocType[]) {
    assert.equal(factLabel(mk({ docType: type, status: "verified", validUntil: null }), today), `${DOC_TYPES[type].label} · 확인됨`);
  }
});

test("factLabel: 확인 대기·반려됨 표시", () => {
  const today = "2026-10-21";
  assert.equal(factLabel(mk({ docType: "id_card", status: "submitted" }), today), "신분증 · 확인 대기");
  assert.equal(factLabel(mk({ docType: "id_card", status: "rejected" }), today), "신분증 · 반려됨");
});

test("중립 원칙: 모든 표시 문구에 보증 표현 없음", () => {
  const banned = /검증|보증|인증됨|추천/;
  const today = "2026-10-21";
  const statuses: DocReviewStatus[] = ["submitted", "verified", "rejected"];
  for (const type of Object.keys(DOC_TYPES) as DocType[]) {
    assert.doesNotMatch(DOC_TYPES[type].label, banned);
    assert.doesNotMatch(DOC_TYPES[type].hint ?? "", banned);
    for (const status of statuses) {
      for (const validUntil of [null, "2027-03-31", "2026-11-01", "2026-10-01"]) {
        for (const meta of [{}, { org: "AIDA", grade: "강사" }]) {
          assert.doesNotMatch(factLabel(mk({ docType: type, status, validUntil, meta }), today), banned);
        }
      }
    }
  }
});
