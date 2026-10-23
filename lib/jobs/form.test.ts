import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY, draftToInput, validateDraft, type Draft } from "./form.ts";

const today = "2026-10-23";
function lesson(over: Partial<Draft> = {}): Draft {
  return {
    ...EMPTY,
    title: "토요일 수업",
    region: "서울",
    classDate: "2026-11-01",
    description: "설명",
    deadline: "2026-10-31",
    ...over,
  };
}

test("validateDraft: 정상", () => {
  assert.equal(validateDraft("lesson", lesson(), today), null);
});

test("validateDraft: 제목 2~60자", () => {
  assert.ok(validateDraft("lesson", lesson({ title: "가" }), today));
  assert.ok(validateDraft("lesson", lesson({ title: "가".repeat(61) }), today));
  assert.equal(validateDraft("lesson", lesson({ title: "가".repeat(60) }), today), null);
});

test("validateDraft: 일정은 오늘 이후", () => {
  assert.ok(validateDraft("lesson", lesson({ classDate: "2026-10-22", deadline: "2026-10-23" }), today));
  const tour = { ...EMPTY, title: "세부 투어", region: "해외", description: "x", destination: "세부", tourStart: "2026-10-22", tourEnd: "2026-10-25", deadline: "2026-10-23" };
  assert.ok(validateDraft("tour", tour, today));
  assert.equal(validateDraft("tour", { ...tour, tourStart: "2026-11-20", tourEnd: "2026-11-25", deadline: "2026-11-13" }, today), null);
});

test("validateDraft: 수정 시 모집 인원은 선택 인원보다 적을 수 없다(같으면 가능)", () => {
  assert.ok(validateDraft("lesson", lesson({ headcount: "1" }), today, 2));
  assert.equal(validateDraft("lesson", lesson({ headcount: "2" }), today, 2), null);
});

test("validateDraft: 마감일은 일정 시작 이전", () => {
  assert.ok(validateDraft("lesson", lesson({ deadline: "2026-11-02" }), today));
});

test("draftToInput: 협의면 단가 없음", () => {
  const i = draftToInput("lesson", lesson({ title: "  수업  " }));
  assert.equal(i.title, "수업");
  assert.equal(i.payAmount, null);
  assert.equal(i.payUnit, null);
  const j = draftToInput("lesson", lesson({ negotiable: false, payAmount: "80000", payUnit: "per_class" }));
  assert.equal(j.payAmount, 80000);
});
