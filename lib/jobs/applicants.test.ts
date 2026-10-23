import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canSelect,
  filterApplicants,
  formatAppliedAt,
  isJobFull,
  selectedCountFor,
  type ApplicantLike,
} from "./applicants.ts";

const app = (id: string, jobId: string, status: ApplicantLike["status"]): ApplicantLike => ({ id, jobId, status });

test("selectedCountFor: 그 공고의 선택됨만 센다", () => {
  const apps = [app("1", "a", "selected"), app("2", "a", "applied"), app("3", "b", "selected"), app("4", "a", "selected")];
  assert.equal(selectedCountFor(apps, "a"), 2);
  assert.equal(selectedCountFor(apps, "b"), 1);
  assert.equal(selectedCountFor(apps, "c"), 0);
});

test("canSelect: 지원함 + 공고 진행중 + 자리 남음일 때만", () => {
  const job = { status: "open" as const, headcount: 2 };
  assert.equal(canSelect({ status: "applied" }, job, 0), true);
  assert.equal(canSelect({ status: "applied" }, job, 1), true);
  assert.equal(canSelect({ status: "applied" }, job, 2), false);
  assert.equal(canSelect({ status: "selected" }, job, 0), false);
  assert.equal(canSelect({ status: "withdrawn" }, job, 0), false);
  assert.equal(canSelect({ status: "not_selected" }, job, 0), false);
  assert.equal(canSelect({ status: "applied" }, { status: "full", headcount: 2 }, 0), false);
  assert.equal(canSelect({ status: "applied" }, { status: "closed", headcount: 2 }, 0), false);
  assert.equal(canSelect({ status: "applied" }, { status: "expired", headcount: 2 }, 0), false);
  assert.equal(canSelect({ status: "applied" }, null, 0), false);
});

test("isJobFull: 선택 수가 인원 이상", () => {
  assert.equal(isJobFull({ headcount: 1 }, 1), true);
  assert.equal(isJobFull({ headcount: 2 }, 1), false);
  assert.equal(isJobFull({ headcount: 2 }, 3), true);
});

test("filterApplicants: 공고 필터 + 취소한 지원은 기본 숨김", () => {
  const apps = [app("1", "a", "applied"), app("2", "a", "withdrawn"), app("3", "b", "selected"), app("4", "b", "not_selected")];
  assert.deepEqual(filterApplicants(apps, { jobId: null, showWithdrawn: false }).map((a) => a.id), ["1", "3", "4"]);
  assert.deepEqual(filterApplicants(apps, { jobId: null, showWithdrawn: true }).map((a) => a.id), ["1", "2", "3", "4"]);
  assert.deepEqual(filterApplicants(apps, { jobId: "a", showWithdrawn: false }).map((a) => a.id), ["1"]);
  assert.deepEqual(filterApplicants(apps, { jobId: "a", showWithdrawn: true }).map((a) => a.id), ["1", "2"]);
  assert.deepEqual(filterApplicants(apps, { jobId: "z", showWithdrawn: true }), []);
});

test("formatAppliedAt: KST M/D HH:MM", () => {
  assert.equal(formatAppliedAt("2026-10-22T15:05:00Z"), "10/23 00:05");
  assert.equal(formatAppliedAt("2026-01-02T03:04:00+00:00"), "1/2 12:04");
  assert.equal(formatAppliedAt("nope"), "");
});
