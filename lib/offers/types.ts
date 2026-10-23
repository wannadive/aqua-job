import type { JobSummary } from "../jobs/types.ts";
import type { Certification, Records } from "../talent-profile/types.ts";
import type { DocRecord } from "../verification/types.ts";

export type OfferStatus = "offered" | "accepted" | "declined" | "withdrawn" | "expired";

/** job_offers 한 행. 연락처는 없다(연락처는 get_offer_contact 결과를 연락처 카드 한 곳에서만). */
export interface Offer {
  id: string;
  jobId: string;
  centerId: string;
  instructorId: string;
  message: string | null;
  status: OfferStatus;
  createdAt: string;
  respondedAt: string | null;
  /** 받은 강사 이름 — 센터가 볼 수 있을 때만(job_can_view_talent), 아니면 null */
  instructorName: string | null;
}

/** 강사가 받은 제안 + 공고 요약(숨김·정지 센터 공고는 null) */
export interface ReceivedOffer extends Offer {
  job: JobSummary | null;
}

/** browse_instructors(009) 한 행: 이력서 공개 칸 + 유효한 서류 사실만. 연락처·비공개 칸 없음. */
export interface BrowseInstructor {
  userId: string;
  displayName: string;
  photoPath: string | null;
  gender: string | null;
  ageBand: string | null;
  regions: string[];
  scopes: string[];
  certifications: Certification[];
  instructorLevel: string | null;
  instructorYears: number | null;
  teachingStyleTags: string[];
  intro: string | null;
  availableDays: string[];
  desiredRate: string | null;
  records: Records;
  /** 유효한 서류(확인됨) — publicFacts에 그대로 넣는다 */
  facts: DocRecord[];
}

/** 강사 찾기 필터(화면 상태). buildBrowseFilters가 009 browse_instructors jsonb로 바꾼다. */
export interface InstructorFilterState {
  regions: string[];
  org: string | null;
  level: string;
  scope: string | null;
  availableDays: string[];
  verifiedOnly: boolean;
}
