import { test } from "node:test";
import assert from "node:assert/strict";
import { INTRO_SLIDES, INTRO_FINAL } from "./slides.ts";

test("도입부 문구는 스펙과 같다", () => {
  assert.equal(INTRO_SLIDES.length, 3);
  assert.equal(INTRO_SLIDES[0].title, "지인 강습만 하시기엔\n아쉬우시죠?");
  assert.equal(INTRO_SLIDES[0].body, "더 많은 기회를 찾아보세요.\nAQUA JOB이 도와드립니다.");
  assert.equal(INTRO_SLIDES[1].title, "프리랜서 프리다이빙 강사로\n경력을 확장하세요");
  assert.equal(INTRO_SLIDES[1].body, "다양한 센터의 공고를 한눈에.\n원하는 조건으로 일하세요.");
  assert.equal(INTRO_SLIDES[2].title, "센터 운영, 강사 섭외에서부터\n고민되시나요?");
  assert.equal(INTRO_SLIDES[2].body, "실제 활동 중인 강사를 빠르게 찾고\n직접 제안까지 보낼 수 있어요.");
  assert.equal(INTRO_FINAL.instructor, "강사 로그인 · 공고 찾기 및 지원");
  assert.equal(INTRO_FINAL.center, "센터 로그인 · 강사 섭외 및 공고 등록");
  assert.equal(INTRO_FINAL.signup, "아직 계정이 없으신가요? 회원가입하기");
  assert.equal(`${INTRO_FINAL.terms} · ${INTRO_FINAL.privacy}`, "이용약관 · 개인정보처리방침");
});

test("화면 표시용 분리 문구가 합성 문구와 같다", () => {
  assert.equal(`${INTRO_FINAL.noAccount} ${INTRO_FINAL.signupLink}`, INTRO_FINAL.signup);
  assert.equal(INTRO_FINAL.title, "AQUA JOB");
});
