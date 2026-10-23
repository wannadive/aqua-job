import { publicFactToDoc } from "../jobs/mappers.ts";
import { recordsFromDb } from "../talent-profile/mappers.ts";
import type { BrowseInstructor, Offer, OfferStatus } from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** job_offers 행. 받은 강사 이름은 profiles 조인이 있을 때만(볼 수 없으면 null). */
export function offerFromRow(row: any): Offer {
  const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    jobId: row.job_id,
    centerId: row.center_id ?? "",
    instructorId: row.instructor_id,
    message: row.message ?? null,
    status: row.status as OfferStatus,
    createdAt: row.created_at,
    respondedAt: row.responded_at ?? null,
    instructorName: prof?.display_name ?? null,
  };
}

/** browse_instructors 행 → 화면용. 서버가 준 칸만 옮긴다(연락처 칸은 서버에 없다). */
export function browseInstructorFromRow(row: any): BrowseInstructor {
  const userId: string = row.user_id;
  const certs = Array.isArray(row.certifications) ? row.certifications : [];
  const facts = Array.isArray(row.facts) ? row.facts : [];
  return {
    userId,
    displayName: row.display_name ?? "",
    photoPath: row.photo_path ?? null,
    gender: row.gender ?? null,
    ageBand: row.age_band ?? null,
    regions: row.regions ?? [],
    scopes: row.scopes ?? [],
    certifications: certs.map((c: any) => ({ org: c?.org ?? "", level: c?.level ?? "" })),
    instructorLevel: row.instructor_level ?? null,
    instructorYears: row.instructor_years ?? null,
    teachingStyleTags: row.teaching_style_tags ?? [],
    intro: row.intro ?? null,
    availableDays: row.available_days ?? [],
    desiredRate: row.desired_rate ?? null,
    records: recordsFromDb(row.records),
    facts: facts.map((f: any) => publicFactToDoc(f, userId)),
  };
}
