import type { Certification, InstructorProfile, Records, Scope } from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function recordsFromDb(j: any): Records {
  const r: Records = {};
  if (j && typeof j === "object") {
    if (typeof j.sta_sec === "number") r.staSec = j.sta_sec;
    if (typeof j.dyn_m === "number") r.dynM = j.dyn_m;
    if (typeof j.cwt_m === "number") r.cwtM = j.cwt_m;
    if (typeof j.fim_m === "number") r.fimM = j.fim_m;
  }
  return r;
}

export function recordsToDb(r: Records): Record<string, number> {
  const o: Record<string, number> = {};
  if (r.staSec != null) o.sta_sec = r.staSec;
  if (r.dynM != null) o.dyn_m = r.dynM;
  if (r.cwtM != null) o.cwt_m = r.cwtM;
  if (r.fimM != null) o.fim_m = r.fimM;
  return o;
}

export function fromRow(row: any): InstructorProfile {
  return {
    userId: row.user_id,
    gender: row.gender ?? null,
    ageBand: row.age_band ?? null,
    regions: row.regions ?? [],
    photoPath: row.photo_path ?? null,
    mbti: row.mbti ?? null,
    intro: row.intro ?? null,
    teachingStyleTags: row.teaching_style_tags ?? [],
    teachingStyleNote: row.teaching_style_note ?? null,
    certifications: (Array.isArray(row.certifications) ? row.certifications : []) as Certification[],
    instructorLevel: row.instructor_level ?? null,
    instructorYears: row.instructor_years ?? null,
    studentsTaught: row.students_taught ?? null,
    records: recordsFromDb(row.records),
    pastCenters: row.past_centers ?? [],
    tourExperience: row.tour_experience ?? null,
    languages: row.languages ?? [],
    otherCerts: row.other_certs ?? [],
    availableDays: row.available_days ?? [],
    availableTime: row.available_time ?? null,
    scopes: (row.scopes ?? []) as Scope[],
    desiredRate: row.desired_rate ?? null,
    isPublic: row.is_public ?? true,
    onboardingDone: row.onboarding_done ?? false,
  };
}

const COLUMN: Record<string, string> = {
  gender: "gender", ageBand: "age_band", regions: "regions", photoPath: "photo_path", mbti: "mbti",
  intro: "intro", teachingStyleTags: "teaching_style_tags", teachingStyleNote: "teaching_style_note",
  certifications: "certifications", instructorLevel: "instructor_level", instructorYears: "instructor_years",
  studentsTaught: "students_taught", pastCenters: "past_centers", tourExperience: "tour_experience",
  languages: "languages", otherCerts: "other_certs", availableDays: "available_days",
  availableTime: "available_time", scopes: "scopes", desiredRate: "desired_rate",
  isPublic: "is_public", onboardingDone: "onboarding_done",
};

export function toRow(patch: Partial<InstructorProfile>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "userId") continue;
    if (k === "records") out.records = recordsToDb(v as Records);
    else if (k === "certifications") out.certifications = (v as Certification[]).filter((c) => c.org || c.level.trim());
    else if (COLUMN[k]) out[COLUMN[k]] = v;
  }
  return out;
}
