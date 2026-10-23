import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysYmd,
  countApplications,
  defaultDeadline,
  formatJobDates,
  formatMdKst,
  formatPay,
  jobDisplayStatus,
  jobErrorMessage,
  metaLine,
  missingForJobType,
  remainingSlots,
  type JobStatusInput,
} from "./logic.ts";
import { JOB_TYPES, PAY_UNITS, REQUIREMENT_TAGS } from "./config.ts";

function st(over: Partial<JobStatusInput> = {}): JobStatusInput {
  return {
    storedStatus: "open",
    closedReason: null,
    jobType: "affiliation",
    deadline: "2026-11-10",
    classDate: null,
    tourStart: null,
    headcount: 2,
    selectedCount: 0,
    ...over,
  };
}

test("config 라벨", () => {
  assert.equal(JOB_TYPES.lesson.label, "수업 단위 섭외");
  assert.equal(JOB_TYPES.tour.short, "투어");
  assert.equal(JOB_TYPES.affiliation.action, "post_affiliation");
  assert.equal(PAY_UNITS.per_class, "회당");
  assert.equal(REQUIREMENT_TAGS.length, 10);
});

test("formatPay", () => {
  assert.equal(formatPay(120000, "per_class"), "회당 120,000원");
  assert.equal(formatPay(3000000, "per_month"), "월 3,000,000원");
  assert.equal(formatPay(null, null), "협의");
  assert.equal(formatPay(100, null), "협의");
});

test("jobDisplayStatus: 마감일 당일은 모집 중, 다음날 expired", () => {
  assert.equal(jobDisplayStatus(st(), "2026-11-10"), "open");
  assert.equal(jobDisplayStatus(st(), "2026-11-11"), "expired");
});

test("jobDisplayStatus: 수업일·투어 시작일이 지나면 expired", () => {
  const l = st({ jobType: "lesson", classDate: "2026-11-02", deadline: "2026-11-30" });
  assert.equal(jobDisplayStatus(l, "2026-11-02"), "open");
  assert.equal(jobDisplayStatus(l, "2026-11-03"), "expired");
  const t = st({ jobType: "tour", tourStart: "2026-12-05", deadline: "2026-12-30" });
  assert.equal(jobDisplayStatus(t, "2026-12-05"), "open");
  assert.equal(jobDisplayStatus(t, "2026-12-06"), "expired");
});

test("jobDisplayStatus: 인원이 차면 full", () => {
  assert.equal(jobDisplayStatus(st({ selectedCount: 1 }), "2026-11-01"), "open");
  assert.equal(jobDisplayStatus(st({ selectedCount: 2 }), "2026-11-01"), "full");
});

test("jobDisplayStatus: hidden > closed 사유 > 날짜 > full", () => {
  const late = "2026-12-01";
  assert.equal(jobDisplayStatus(st({ storedStatus: "hidden", selectedCount: 2 }), late), "hidden");
  assert.equal(jobDisplayStatus(st({ storedStatus: "closed", closedReason: "full" }), late), "full");
  assert.equal(jobDisplayStatus(st({ storedStatus: "closed", closedReason: "expired" }), "2026-11-01"), "expired");
  assert.equal(jobDisplayStatus(st({ storedStatus: "closed", closedReason: "manual" }), late), "closed");
  // 날짜가 지났고 인원도 찼으면 expired가 full보다 먼저
  assert.equal(jobDisplayStatus(st({ selectedCount: 2 }), late), "expired");
});

test("remainingSlots는 0 미만이 없다", () => {
  assert.equal(remainingSlots(3, 1), 2);
  assert.equal(remainingSlots(2, 2), 0);
  assert.equal(remainingSlots(2, 5), 0);
});

const base = {
  classDate: null,
  startTime: null,
  endTime: null,
  workDays: [] as string[],
  workTime: null,
  tourStart: null,
  tourEnd: null,
  destination: null,
  destinationKind: null,
};

test("formatJobDates: 수업", () => {
  const j = { ...base, jobType: "lesson" as const, classDate: "2026-11-02", startTime: "09:00:00", endTime: "13:00" };
  assert.equal(formatJobDates(j), "11/2(월) 09:00–13:00");
  assert.equal(formatJobDates({ ...j, startTime: null, endTime: null }), "11/2(월)");
});

test("formatJobDates: 수업 요일은 달력 기준", () => {
  assert.equal(
    formatJobDates({ ...base, jobType: "lesson", classDate: "2026-11-07", startTime: "09:00", endTime: "13:00" }),
    "11/7(토) 09:00–13:00",
  );
});

test("formatJobDates: 소속", () => {
  assert.equal(
    formatJobDates({ ...base, jobType: "affiliation", workDays: ["월", "수", "금"], workTime: "저녁" }),
    "월·수·금 저녁",
  );
  assert.equal(formatJobDates({ ...base, jobType: "affiliation", workDays: ["토"], workTime: null }), "토");
});

test("formatJobDates: 투어", () => {
  assert.equal(
    formatJobDates({
      ...base,
      jobType: "tour",
      tourStart: "2026-12-05",
      tourEnd: "2026-12-09",
      destination: "보홀",
      destinationKind: "overseas",
    }),
    "12/5(토)~12/9(수) · 보홀(해외)",
  );
  assert.equal(
    formatJobDates({ ...base, jobType: "tour", tourStart: "2026-12-05", tourEnd: "2026-12-09", destination: "제주", destinationKind: "domestic" }),
    "12/5(토)~12/9(수) · 제주(국내)",
  );
});

test("metaLine", () => {
  assert.equal(metaLine("2026-10-21T03:00:00Z", null, 128), "10/21 등록 · 조회 128");
  assert.equal(metaLine("2026-10-21T03:00:00Z", "2026-10-22T03:00:00Z", 128), "10/21 등록 · 10/22 수정됨 · 조회 128");
});

test("metaLine: KST 날짜로 센다(UTC 15시 이후는 다음 날)", () => {
  assert.equal(metaLine("2026-10-20T15:30:00Z", null, 0), "10/21 등록 · 조회 0");
});

test("missingForJobType: 해당 종류 규칙만 본다", () => {
  const rules = [
    { action: "post_lesson" as const, docType: "business_registration" as const },
    { action: "post_tour" as const, docType: "business_registration" as const },
    { action: "post_tour" as const, docType: "travel_business" as const },
    { action: "send_offer" as const, docType: "representative_id" as const },
  ];
  assert.deepEqual(missingForJobType([], rules, "lesson"), ["business_registration"]);
  assert.deepEqual(missingForJobType(["business_registration"], rules, "lesson"), []);
  assert.deepEqual(missingForJobType(["business_registration"], rules, "tour"), ["travel_business"]);
  assert.deepEqual(missingForJobType([], rules, "affiliation"), []);
});

test("jobErrorMessage", () => {
  assert.equal(jobErrorMessage({ code: "22023", message: "마감일은 오늘 이후여야 해요" }), "마감일은 오늘 이후여야 해요");
  assert.equal(jobErrorMessage({ code: "42501", message: "permission denied" }), "이 작업을 할 권한이 없어요");
  assert.equal(jobErrorMessage({ code: "P0002", message: "공고를 찾을 수 없어요" }), "공고를 찾을 수 없어요");
  assert.match(jobErrorMessage({ code: "22P02", message: "invalid input syntax" }), /형식/);
  assert.equal(jobErrorMessage({ message: "fetch failed" }), "잠시 후 다시 시도해 주세요");
  assert.equal(jobErrorMessage(null), "잠시 후 다시 시도해 주세요");
});

test("formatMdKst: 잘못된 시각은 빈 문자열", () => {
  assert.equal(formatMdKst("not-a-date"), "");
  assert.equal(formatMdKst("2026-10-21T20:00:00Z"), "10/22");
});

test("defaultDeadline", () => {
  assert.equal(addDaysYmd("2026-03-01", -1), "2026-02-28");
  assert.equal(defaultDeadline("lesson", { classDate: "2026-11-10" }, "2026-10-23"), "2026-11-09");
  assert.equal(defaultDeadline("lesson", { classDate: "2026-10-23" }, "2026-10-23"), "2026-10-23");
  assert.equal(defaultDeadline("tour", { tourStart: "2026-12-20" }, "2026-10-23"), "2026-12-13");
  assert.equal(defaultDeadline("tour", { tourStart: "2026-10-25" }, "2026-10-23"), "2026-10-23");
  assert.equal(defaultDeadline("affiliation", {}, "2026-10-23"), "2026-11-06");
  assert.equal(defaultDeadline("lesson", {}, "2026-10-23"), "2026-11-06");
});

test("countApplications: 지원 취소 제외", () => {
  const m = countApplications([
    { jobId: "a", status: "applied" },
    { jobId: "a", status: "selected" },
    { jobId: "a", status: "withdrawn" },
    { jobId: "b", status: "not_selected" },
  ]);
  assert.deepEqual(m.get("a"), { applied: 1, selected: 1, total: 2 });
  assert.deepEqual(m.get("b"), { applied: 0, selected: 0, total: 1 });
});
