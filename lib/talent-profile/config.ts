export const GENDER_OPTIONS = ["여", "남", "밝히지 않음"] as const;
export const AGE_BAND_OPTIONS = ["20대", "30대", "40대", "50대 이상"] as const;
export const REGION_OPTIONS = ["서울", "경기", "인천", "강원", "충청", "전라", "경상", "부산", "제주", "해외"] as const;
export const SCOPE_OPTIONS = [
  { value: "pool", label: "수영장(풀)" },
  { value: "sea", label: "바다(국내)" },
  { value: "overseas_tour", label: "해외 투어" },
] as const;
export const CERT_ORG_OPTIONS = ["AIDA", "PADI", "SSI", "Molchanovs", "CMAS", "기타"] as const;
export const MBTI_OPTIONS = [
  "ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ", "모름",
] as const;
export const STYLE_TAG_OPTIONS = ["꼼꼼한", "친근한", "체계적인", "유쾌한", "차분한", "안전 중심", "기록 향상", "입문자 전문"] as const;
export const DAY_OPTIONS = ["월", "화", "수", "목", "금", "토", "일"] as const;
export const TIME_OPTIONS = ["오전", "오후", "저녁", "주말 종일"] as const;
