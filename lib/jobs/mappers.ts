import type { DocRecord, DocType } from "../verification/types.ts";
import type {
  ApplicationStatus,
  CenterJobHistoryItem,
  CenterPublicProfile,
  JobApplication,
  JobCenterInfo,
  JobDetail,
  JobStatus,
  JobSummary,
  JobType,
  PayUnit,
} from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const hhmm = (t: any): string | null => (typeof t === "string" && t ? t.slice(0, 5) : null);

export function jobSummaryFromRow(row: any): JobSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    centerId: row.center_id ?? "",
    centerName: row.center_name ?? "",
    jobType: row.job_type as JobType,
    title: row.title,
    region: row.region,
    venue: row.venue ?? null,
    classDate: row.class_date ?? null,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    workDays: row.work_days ?? [],
    workTime: row.work_time ?? null,
    tourStart: row.tour_start ?? null,
    tourEnd: row.tour_end ?? null,
    destination: row.destination ?? null,
    destinationKind: row.destination_kind ?? null,
    coversFlight: row.covers_flight ?? null,
    coversLodging: row.covers_lodging ?? null,
    payAmount: row.pay_amount ?? null,
    payUnit: (row.pay_unit ?? null) as PayUnit | null,
    headcount: row.headcount,
    remaining: row.remaining,
    requirementTags: row.requirement_tags ?? [],
    deadline: row.deadline,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    status: row.effective_status as JobStatus,
  };
}

function centerInfoFromJson(c: any, fallbackName: string): JobCenterInfo {
  const o = c && typeof c === "object" ? c : {};
  return {
    centerName: o.center_name ?? fallbackName,
    representativeName: o.representative_name ?? null,
    headInstructor: o.head_instructor ?? null,
    instructorCount: o.instructor_count ?? null,
    instructorNames: o.instructor_names ?? [],
    monthlyStudents: o.monthly_students ?? null,
    teachingDays: o.teaching_days ?? [],
    teachingTime: o.teaching_time ?? null,
    venues: o.venues ?? [],
    address: o.address ?? null,
    photoPaths: o.photo_paths ?? [],
  };
}

export function jobDetailFromRow(row: any): JobDetail {
  const s = jobSummaryFromRow(row);
  return { ...s, description: row.description ?? "", center: centerInfoFromJson(row.center, s.centerName) };
}

/** job_applications 행. 지원자 이름은 profiles 조인이 있을 때만. */
export function applicationFromRow(row: any): JobApplication {
  const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    jobId: row.job_id,
    instructorId: row.instructor_id,
    message: row.message ?? null,
    status: row.status as ApplicationStatus,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
    applicantName: prof?.display_name ?? null,
  };
}

export function centerJobHistoryFromRow(row: any): CenterJobHistoryItem {
  return {
    id: row.id,
    centerId: row.center_id ?? "",
    title: row.title,
    jobType: row.job_type as JobType,
    payAmount: row.pay_amount ?? null,
    payUnit: (row.pay_unit ?? null) as PayUnit | null,
    createdAt: row.created_at,
    status: row.effective_status as JobStatus,
  };
}

export function centerPublicProfileFromRow(row: any): CenterPublicProfile {
  return {
    centerId: row.center_id ?? "",
    userId: row.user_id,
    centerName: row.center_name ?? "",
    venues: row.venues ?? [],
    teachingDays: row.teaching_days ?? [],
    teachingTime: row.teaching_time ?? null,
    photoPaths: row.photo_paths ?? [],
    detailVisible: !!row.detail_visible,
    representativeName: row.representative_name ?? null,
    headInstructor: row.head_instructor ?? null,
    instructorCount: row.instructor_count ?? null,
    instructorNames: row.instructor_names ?? [],
    monthlyStudents: row.monthly_students ?? null,
    address: row.address ?? null,
  };
}

/** get_public_facts 행 → effective/publicFacts가 받는 DocRecord(확인된 서류) */
export function publicFactToDoc(row: any, userId: string): DocRecord {
  const meta: DocRecord["meta"] = {};
  if (typeof row.org === "string" && row.org) meta.org = row.org;
  if (typeof row.grade === "string" && row.grade) meta.grade = row.grade;
  const verifiedAt: string | null = row.verified_at ?? null;
  return {
    id: `${userId}:${row.doc_type}`,
    ownerId: userId,
    docType: row.doc_type as DocType,
    status: "verified",
    validUntil: row.valid_until ?? null,
    meta,
    rejectReason: null,
    submittedAt: verifiedAt ?? "",
    verifiedAt,
  };
}
