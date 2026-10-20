import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingObjectError, isSuperseded, kstDate, latestPendingPerOwnerType, PURGE_DOC_TYPES, purgeDecision } from "./admin-logic.ts";

type Row = { id: string; ownerId: string; docType: string; status: "submitted" | "verified" | "rejected"; submittedAt: string };
const r = (id: string, ownerId: string, docType: string, status: Row["status"], submittedAt: string): Row => ({ id, ownerId, docType, status, submittedAt });

test("latestPendingPerOwnerType: 같은 사람·같은 종류는 가장 최근 제출 건만, 오래된 순", () => {
  const out = latestPendingPerOwnerType([
    r("a1", "u1", "id_card", "submitted", "2026-10-01T00:00:00Z"),
    r("a2", "u1", "id_card", "submitted", "2026-10-03T00:00:00Z"),
    r("b1", "u1", "instructor_cert", "submitted", "2026-10-02T00:00:00Z"),
    r("c1", "u2", "id_card", "submitted", "2026-09-30T00:00:00Z"),
  ]);
  assert.deepEqual(out.map((d) => d.id), ["c1", "b1", "a2"]);
});

test("latestPendingPerOwnerType: 더 최근 건이 이미 처리됐으면 오래된 대기 건은 숨긴다", () => {
  const out = latestPendingPerOwnerType([
    r("old", "u1", "id_card", "submitted", "2026-10-01T00:00:00Z"),
    r("new", "u1", "id_card", "verified", "2026-10-02T00:00:00Z"),
    r("x", "u1", "first_aid", "rejected", "2026-10-02T00:00:00Z"),
  ]);
  assert.deepEqual(out, []);
});

test("latestPendingPerOwnerType: 반려 뒤 다시 올린 건은 대기열에 뜬다", () => {
  const out = latestPendingPerOwnerType([
    r("rej", "u1", "first_aid", "rejected", "2026-10-01T00:00:00Z"),
    r("re", "u1", "first_aid", "submitted", "2026-10-05T00:00:00Z"),
  ]);
  assert.deepEqual(out.map((d) => d.id), ["re"]);
});

test("purgeDecision: 없는 서류 404, 확인 전·삭제 대상 아님 409, 이미 비움 done, 그 외 purge", () => {
  assert.equal(purgeDecision(null), "not_found");
  assert.equal(purgeDecision({ status: "submitted", docType: "id_card", filePath: "u/a.jpg" }), "conflict");
  assert.equal(purgeDecision({ status: "verified", docType: "instructor_cert", filePath: "u/a.jpg" }), "conflict");
  assert.equal(purgeDecision({ status: "verified", docType: "id_card", filePath: null }), "already_purged");
  assert.equal(purgeDecision({ status: "verified", docType: "representative_id", filePath: "u/a.jpg" }), "purge");
  assert.equal(purgeDecision({ status: "verified", docType: "unknown_type", filePath: "u/a.jpg" }), "conflict");
});

test("purgeDecision: 반려된 신분증도 원본을 지운다(자격증 등은 아님)", () => {
  assert.equal(purgeDecision({ status: "rejected", docType: "id_card", filePath: "u/a.jpg" }), "purge");
  assert.equal(purgeDecision({ status: "rejected", docType: "representative_id", filePath: null }), "already_purged");
  assert.equal(purgeDecision({ status: "rejected", docType: "instructor_cert", filePath: "u/a.jpg" }), "conflict");
});

test("purgeDecision: 확인 대기 신분증은 더 최근에 다시 올린 경우(superseded)에만 지운다", () => {
  assert.equal(purgeDecision({ status: "submitted", docType: "id_card", filePath: "u/a.jpg" }, { superseded: false }), "conflict");
  assert.equal(purgeDecision({ status: "submitted", docType: "id_card", filePath: "u/a.jpg" }, { superseded: true }), "purge");
  assert.equal(purgeDecision({ status: "submitted", docType: "id_card", filePath: null }, { superseded: true }), "already_purged");
  assert.equal(purgeDecision({ status: "submitted", docType: "first_aid", filePath: "u/a.jpg" }, { superseded: true }), "conflict");
});

test("isSuperseded: 같은 사람·같은 종류에 더 나중 제출이 있을 때만", () => {
  const doc = { id: "b", ownerId: "u1", docType: "id_card", submittedAt: "2026-10-01T00:00:00Z" };
  assert.equal(isSuperseded(doc, [doc]), false);
  assert.equal(isSuperseded(doc, [doc, { ...doc, id: "c", submittedAt: "2026-10-02T00:00:00Z" }]), true);
  assert.equal(isSuperseded(doc, [{ ...doc, id: "z", submittedAt: "2026-09-30T00:00:00Z" }]), false);
  assert.equal(isSuperseded(doc, [{ ...doc, id: "c", ownerId: "u2", submittedAt: "2026-10-02T00:00:00Z" }]), false);
  assert.equal(isSuperseded(doc, [{ ...doc, id: "c", docType: "representative_id", submittedAt: "2026-10-02T00:00:00Z" }]), false);
  // 제출 시각이 같으면 id가 큰 쪽이 최신(대기열과 같은 기준)
  assert.equal(isSuperseded(doc, [{ ...doc, id: "c" }]), true);
  assert.equal(isSuperseded(doc, [{ ...doc, id: "a" }]), false);
});

test("isMissingObjectError: Storage의 '파일 없음' 오류만 골라낸다", () => {
  assert.equal(isMissingObjectError({ message: "Object not found" }), true);
  assert.equal(isMissingObjectError({ message: "not_found", statusCode: "404" }), true);
  assert.equal(isMissingObjectError({ message: "x", statusCode: 404 }), true);
  assert.equal(isMissingObjectError({ message: "Failed to fetch" }), false);
  assert.equal(isMissingObjectError(null), false);
});

test("kstDate: 한국 날짜로 표시", () => {
  assert.equal(kstDate("2026-10-21T14:59:59Z"), "2026.10.21");
  assert.equal(kstDate("2026-10-21T15:00:00Z"), "2026.10.22");
});

test("latestPendingPerOwnerType: 제출 시각이 같으면 id가 큰 쪽을 최신으로(입력 순서와 무관)", () => {
  const a = r("id-a", "u1", "id_card", "submitted", "2026-10-01T00:00:00Z");
  const b = r("id-b", "u1", "id_card", "submitted", "2026-10-01T00:00:00Z");
  assert.deepEqual(latestPendingPerOwnerType([a, b]).map((d) => d.id), ["id-b"]);
  assert.deepEqual(latestPendingPerOwnerType([b, a]).map((d) => d.id), ["id-b"]);
  const c = r("id-c", "u2", "id_card", "submitted", "2026-10-01T00:00:00Z");
  assert.deepEqual(latestPendingPerOwnerType([c, b]).map((d) => d.id), ["id-b", "id-c"]);
});

test("PURGE_DOC_TYPES: 신분증 두 종류만", () => {
  assert.deepEqual([...PURGE_DOC_TYPES].sort(), ["id_card", "representative_id"]);
});
