import type { CenterProfile } from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function centerFromRow(row: any): CenterProfile {
  return {
    userId: row.user_id,
    centerName: row.center_name ?? null,
    representativeName: row.representative_name ?? null,
    headInstructor: row.head_instructor ?? null,
    instructorCount: row.instructor_count ?? null,
    instructorNames: row.instructor_names ?? [],
    monthlyStudents: row.monthly_students ?? null,
    teachingDays: row.teaching_days ?? [],
    teachingTime: row.teaching_time ?? null,
    venues: row.venues ?? [],
    address: row.address ?? null,
    photoPaths: row.photo_paths ?? [],
  };
}

const COLUMN: Record<string, string> = {
  centerName: "center_name", representativeName: "representative_name", headInstructor: "head_instructor",
  instructorCount: "instructor_count", instructorNames: "instructor_names", monthlyStudents: "monthly_students",
  teachingDays: "teaching_days", teachingTime: "teaching_time", venues: "venues", address: "address",
  photoPaths: "photo_paths",
};

export function centerToRow(patch: Partial<CenterProfile>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (COLUMN[k]) out[COLUMN[k]] = typeof v === "string" ? (v.trim() || null) : v;
  }
  return out;
}
