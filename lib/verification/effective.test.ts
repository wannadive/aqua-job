import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveDoc, publicFacts } from "./effective.ts";
import type { DocRecord } from "./types.ts";

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

test("effectiveDoc: 확인된 것 중 최신, 만료 제외, 대기/반려 무시", () => {
  const today = "2026-10-23";
  const docs = [
    mk({ id: "old", docType: "instructor_cert", status: "verified", verifiedAt: "2026-01-01T00:00:00Z", validUntil: "2027-01-01" }),
    mk({ id: "new", docType: "instructor_cert", status: "submitted", submittedAt: "2026-10-20T00:00:00Z" }),
  ];
  assert.equal(effectiveDoc(docs, "instructor_cert", today)?.id, "old");
  assert.equal(effectiveDoc([mk({ status: "verified", validUntil: "2026-10-22", verifiedAt: "2026-01-01T00:00:00Z" })], "instructor_cert", today), undefined);
  assert.equal(effectiveDoc([mk({ status: "verified", validUntil: "2026-10-23", verifiedAt: "2026-01-01T00:00:00Z" })], "instructor_cert", today)?.status, "verified");
});

test("effectiveDoc: 확인 건이 여럿이면 가장 최근 확인 건, 그게 만료면 없음(이전 건으로 내려가지 않음)", () => {
  const today = "2026-10-23";
  const older = mk({ id: "older", status: "verified", verifiedAt: "2026-01-01T00:00:00Z", validUntil: "2027-06-01" });
  const newer = mk({ id: "newer", status: "verified", verifiedAt: "2026-05-01T00:00:00Z", validUntil: "2027-01-01" });
  assert.equal(effectiveDoc([older, newer], "instructor_cert", today)?.id, "newer");
  const newerExpired = { ...newer, validUntil: "2026-10-01" };
  assert.equal(effectiveDoc([older, newerExpired], "instructor_cert", today), undefined);
  // 반려 건은 무시하고 다른 종류도 섞이지 않는다
  assert.equal(effectiveDoc([mk({ status: "rejected" }), mk({ docType: "first_aid", status: "verified", verifiedAt: "2026-01-01T00:00:00Z" })], "instructor_cert", today), undefined);
});

test("publicFacts: 남에게는 유효 서류만, 금지어 없음", () => {
  const f = publicFacts([mk({ docType: "id_card", status: "rejected" }), mk({ docType: "liability_insurance", status: "verified", validUntil: "2026-11-01", verifiedAt: "2026-01-01T00:00:00Z" })], "2026-10-23");
  assert.deepEqual(f.map(x => [x.type, x.tone]), [["liability_insurance", "warn"]]);
  for (const x of f) assert.doesNotMatch(x.label, /검증|보증|인증됨|추천/);
});

test("publicFacts: 확인됨은 ok, 대기·만료는 빠지고 이전 확인 건이 유효하면 그것을 보여 준다", () => {
  const today = "2026-10-23";
  const f = publicFacts(
    [
      mk({ id: "c1", docType: "instructor_cert", status: "verified", verifiedAt: "2026-01-01T00:00:00Z", validUntil: "2027-03-31", meta: { org: "AIDA" } }),
      mk({ id: "c2", docType: "instructor_cert", status: "submitted", submittedAt: "2026-10-20T00:00:00Z" }),
      mk({ id: "f1", docType: "first_aid", status: "verified", verifiedAt: "2026-01-01T00:00:00Z", validUntil: "2026-10-01" }),
      mk({ id: "b1", docType: "business_registration", status: "submitted" }),
    ],
    today,
  );
  assert.deepEqual(f, [{ type: "instructor_cert", label: "AIDA 강사 자격증 · 2027.03까지", tone: "ok" }]);
});
