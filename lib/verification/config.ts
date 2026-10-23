import type { DocType } from "./types.ts";

export const EXPIRING_DAYS = 30;

const ID_HINT = "주민등록번호 뒷자리는 가리고 찍어 주세요. 확인이 끝나면 사진은 바로 삭제돼요.";

export const DOC_TYPES: Record<
  DocType,
  { label: string; owner: "instructor" | "center"; hasExpiry: boolean; deleteOriginalOnVerify: boolean; required: boolean; hint?: string }
> = {
  instructor_cert: { label: "강사 자격증", owner: "instructor", hasExpiry: true, deleteOriginalOnVerify: false, required: true },
  liability_insurance: { label: "강사 배상책임보험", owner: "instructor", hasExpiry: true, deleteOriginalOnVerify: false, required: true },
  first_aid: { label: "응급처치·CPR", owner: "instructor", hasExpiry: true, deleteOriginalOnVerify: false, required: false },
  id_card: { label: "신분증", owner: "instructor", hasExpiry: false, deleteOriginalOnVerify: true, required: true, hint: ID_HINT },
  business_registration: { label: "사업자등록증", owner: "center", hasExpiry: false, deleteOriginalOnVerify: false, required: true },
  travel_business: { label: "여행업 등록증", owner: "center", hasExpiry: false, deleteOriginalOnVerify: false, required: false },
  representative_id: { label: "대표자 신분증", owner: "center", hasExpiry: false, deleteOriginalOnVerify: true, required: true, hint: ID_HINT },
  rep_instructor_cert: { label: "대표강사 자격증", owner: "center", hasExpiry: true, deleteOriginalOnVerify: false, required: false },
};

/** 서류 원본 비공개 버킷(006). 새 서류는 여기에 올린다. */
export const VERIFICATION_BUCKET = "verification-docs";
/** 006 이전에 올린 서류(테스트 데이터)가 남아 있는 옛 버킷. 테스트 파일을 다 지우면 없앤다. */
export const LEGACY_VERIFICATION_BUCKET = "documents";
