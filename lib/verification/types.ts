export type DocType =
  | "instructor_cert"
  | "liability_insurance"
  | "first_aid"
  | "id_card"
  | "business_registration"
  | "travel_business"
  | "representative_id"
  | "rep_instructor_cert";

/** DB에 저장되는 값 */
export type DocReviewStatus = "submitted" | "verified" | "rejected";

/** 화면용 계산 값 */
export type DocDisplayStatus = "missing" | "submitted" | "verified" | "expiring" | "expired" | "rejected";

export interface DocRecord {
  id: string;
  ownerId: string;
  docType: DocType;
  status: DocReviewStatus;
  /** YYYY-MM-DD */
  validUntil: string | null;
  meta: { org?: string; grade?: string; number?: string };
  rejectReason: string | null;
  submittedAt: string;
  verifiedAt: string | null;
}
