import type { JobType, PayUnit } from "./types.ts";

export const JOB_TYPES: Record<
  JobType,
  { label: string; short: string; action: "post_lesson" | "post_affiliation" | "post_tour" }
> = {
  lesson: { label: "수업 단위 섭외", short: "수업", action: "post_lesson" },
  affiliation: { label: "소속 계약", short: "소속", action: "post_affiliation" },
  tour: { label: "투어 동행 강사 모집", short: "투어", action: "post_tour" },
};

export const PAY_UNITS: Record<PayUnit, string> = {
  per_class: "회당",
  per_hour: "시간당",
  per_day: "일당",
  per_month: "월",
  total: "총",
};

export const REQUIREMENT_TAGS = [
  "AIDA 강사 이상",
  "PADI 강사 이상",
  "SSI 강사 이상",
  "Molchanovs 강사 이상",
  "레스큐 가능",
  "배상책임보험",
  "응급처치",
  "영어 가능",
  "해외 투어 경험",
  "입문자 수업 경험",
] as const;

/** 공고 상세 하단 고지문 */
export function jobDisclaimer(centerName: string): string {
  return `본 정보는 ${centerName}에서 제공한 자료이며, 아쿠아잡은 기재 내용에 대해 보증하지 않습니다.`;
}
