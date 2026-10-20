import { test } from "node:test";
import assert from "node:assert/strict";
import { docFromRow } from "./mappers.ts";

test("docFromRow: snake_case 행을 DocRecord로 바꾼다", () => {
  const d = docFromRow({
    id: "d1", owner_id: "u1", doc_type: "instructor_cert", status: "verified",
    valid_until: "2027-03-31", meta: { org: "AIDA", grade: "강사", extra: 1 },
    reject_reason: null, submitted_at: "2026-10-01T00:00:00Z", verified_at: "2026-10-02T00:00:00Z",
  });
  assert.deepEqual(d, {
    id: "d1", ownerId: "u1", docType: "instructor_cert", status: "verified",
    validUntil: "2027-03-31", meta: { org: "AIDA", grade: "강사" }, rejectReason: null,
    submittedAt: "2026-10-01T00:00:00Z", verifiedAt: "2026-10-02T00:00:00Z",
  });
});

test("docFromRow: 비어 있는 값은 null과 빈 meta로", () => {
  const d = docFromRow({ id: "d2", owner_id: "u1", doc_type: "id_card", status: "submitted", meta: null, submitted_at: "2026-10-01T00:00:00Z" });
  assert.equal(d.validUntil, null);
  assert.equal(d.verifiedAt, null);
  assert.deepEqual(d.meta, {});
});
