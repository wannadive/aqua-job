import { test } from "node:test";
import assert from "node:assert/strict";
import { isDirty, pick, sameValue } from "./dirty.ts";

test("처음 값 그대로면 작성 중이 아니다(여는 것만으로는 아님)", () => {
  const init = { title: "", tags: [] as string[], n: 1, ok: false };
  assert.equal(isDirty(init, { ...init, tags: [] }), false);
});

test("글자를 바꾸면 작성 중", () => {
  assert.equal(isDirty({ t: "" }, { t: "가" }), true);
  assert.equal(isDirty({ t: "가" }, { t: "가나" }), true);
});

test("공백만 쳤거나 앞뒤 공백만 다르면 바뀐 게 아님", () => {
  assert.equal(isDirty({ t: "" }, { t: "   " }), false);
  assert.equal(isDirty({ t: "가" }, { t: " 가 " }), false);
});

test("빈 값끼리(null · undefined · 빈 글자)는 같다", () => {
  assert.equal(sameValue(null, undefined), true);
  assert.equal(sameValue(null, ""), true);
  assert.equal(isDirty({ a: null }, {}), false);
  assert.equal(isDirty({}, { a: "" }), false);
  assert.equal(isDirty({ a: null }, { a: "x" }), true);
});

test("배열은 순서·길이까지", () => {
  assert.equal(isDirty(["월", "화"], ["월", "화"]), false);
  assert.equal(isDirty(["월", "화"], ["화", "월"]), true);
  assert.equal(isDirty(["월"], ["월", "화"]), true);
  assert.equal(isDirty([], null), true);
});

test("켜고 끈 값·숫자·중첩 객체", () => {
  assert.equal(isDirty({ on: false }, { on: true }), true);
  assert.equal(isDirty({ n: 1 }, { n: 2 }), true);
  assert.equal(isDirty({ n: Number.NaN }, { n: Number.NaN }), false);
  assert.equal(isDirty({ r: { sta: 300 } }, { r: { sta: 300 } }), false);
  assert.equal(isDirty({ r: { sta: 300 } }, { r: { sta: 301 } }), true);
  assert.equal(isDirty({ r: {} }, { r: { sta: 300 } }), true);
});

test("다시 처음 값으로 돌리면 작성 중이 아니다", () => {
  const init = { t: "원래" };
  const edited = { t: "바꿈" };
  assert.equal(isDirty(init, edited), true);
  assert.equal(isDirty(init, { t: "원래" }), false);
});

test("파일 같은 객체는 같은 것인지만", () => {
  class F {}
  const f = new F();
  assert.equal(isDirty({ file: null }, { file: f }), true);
  assert.equal(isDirty({ file: f }, { file: f }), false);
  assert.equal(isDirty({ file: new F() }, { file: new F() }), true);
});

test("pick: 정한 키만", () => {
  assert.deepEqual(pick({ a: 1, b: 2, c: 3 }, ["a", "c"]), { a: 1, c: 3 });
});
