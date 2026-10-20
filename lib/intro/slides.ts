import { BRAND } from "../brand.ts";

// 도입부 문구 (스펙 §9-1). 줄바꿈은 \n.
export const INTRO_SLIDES = [
  {
    title: "지인 강습만 하시기엔\n아쉬우시죠?",
    body: `더 많은 기회를 찾아보세요.\n${BRAND.appName}이 도와드립니다.`,
  },
  {
    title: "프리랜서 프리다이빙 강사로\n경력을 확장하세요",
    body: "다양한 센터의 공고를 한눈에.\n원하는 조건으로 일하세요.",
  },
  {
    title: "센터 운영, 강사 섭외에서부터\n고민되시나요?",
    body: "실제 활동 중인 강사를 빠르게 찾고\n직접 제안까지 보낼 수 있어요.",
  },
] as const;

const INSTRUCTOR_TITLE = "강사 로그인";
const INSTRUCTOR_SUB = "공고 찾기 및 지원";
const CENTER_TITLE = "센터 로그인";
const CENTER_SUB = "강사 섭외 및 공고 등록";

export const INTRO_FINAL = {
  title: BRAND.appName,
  body: "시작하기",
  instructorTitle: INSTRUCTOR_TITLE,
  instructorSub: INSTRUCTOR_SUB,
  centerTitle: CENTER_TITLE,
  centerSub: CENTER_SUB,
  instructor: `${INSTRUCTOR_TITLE} · ${INSTRUCTOR_SUB}`,
  center: `${CENTER_TITLE} · ${CENTER_SUB}`,
  noAccount: "아직 계정이 없으신가요?",
  signupLink: "회원가입하기",
  signup: "아직 계정이 없으신가요? 회원가입하기",
  terms: "이용약관",
  privacy: "개인정보처리방침",
} as const;
