export const GENDER_OPTIONS = ["여", "남", "밝히지 않음"] as const;
export const AGE_BAND_OPTIONS = ["20대", "30대", "40대", "50대 이상"] as const;
/** 지역 목록 — DB public.job_region_options()(007)와 같아야 한다(lib/jobs/regions.test.ts가 검사) */
export const REGION_OPTIONS =["서울", "경기", "인천", "강원", "충청", "전라", "경상", "부산", "제주", "해외"] as const;
export const SCOPE_OPTIONS = [
  { value: "pool", label: "수영장(풀)" },
  { value: "sea", label: "바다(국내)" },
  { value: "overseas_tour", label: "해외 투어" },
] as const;
export const CERT_ORG_OPTIONS = ["AIDA", "PADI", "SSI", "Molchanovs", "CMAS", "기타"] as const;
export type CertOrg = (typeof CERT_ORG_OPTIONS)[number];
/**
 * 단체별 등급 목록(이력서 입력·강사 찾기 필터가 같이 쓴다). 저장되는 글자 그대로이고,
 * 서버 필터(browse_instructors, 009)는 단체·등급을 lower(btrim()) 일치로 찾는다
 * — 이미 있는 값을 바꾸면 예전 이력서와 안 맞으니 덧붙이기만.
 * "기타" 단체는 목록 없이 직접 입력. 목록에 없는 등급은 화면에서 "기타(직접 입력)"로 적는다.
 */
export const CERT_LEVELS: Record<CertOrg, readonly string[]> = {
  AIDA: ["AIDA1", "AIDA2", "AIDA3", "AIDA4", "Instructor", "Master Instructor", "Instructor Trainer"],
  PADI: ["Freediver", "Advanced Freediver", "Master Freediver", "Instructor", "Master Instructor", "Instructor Trainer"],
  SSI: ["Level 1", "Level 2", "Level 3", "Instructor", "Instructor Trainer"],
  Molchanovs: ["Wave 1", "Wave 2", "Wave 3", "Wave 4", "Instructor", "Instructor Trainer"],
  CMAS: ["1 Star", "2 Star", "3 Star", "Instructor 1 Star", "Instructor 2 Star", "Instructor 3 Star"],
  기타: [],
};
/** 등급 목록에 없을 때 고르는 칸(화면 전용 — 저장은 직접 적은 글자) */
export const CERT_LEVEL_OTHER = "기타(직접 입력)";
export const MBTI_OPTIONS = [
  "ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ", "모름",
] as const;
export const STYLE_TAG_OPTIONS = ["꼼꼼한", "친근한", "체계적인", "유쾌한", "차분한", "안전 중심", "기록 향상", "입문자 전문"] as const;
export const DAY_OPTIONS = ["월", "화", "수", "목", "금", "토", "일"] as const;
export const TIME_OPTIONS = ["오전", "오후", "저녁", "주말 종일"] as const;
