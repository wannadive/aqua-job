import type { InstructorProfile, ResumeStep, Records } from "./types.ts";

export const RESUME_STEPS: ResumeStep[] = [
  { key: "gender", title: "성별을 알려주세요", kind: "single" },
  { key: "ageBand", title: "나이대를 알려주세요", kind: "single" },
  { key: "regions", title: "활동 지역을 골라주세요", help: "여러 개 고를 수 있어요", kind: "multi" },
  { key: "scopes", title: "주로 교육하는 곳은 어디인가요?", help: "여러 개 고를 수 있어요", kind: "multi" },
  { key: "certifications", title: "자격 단체와 등급을 알려주세요", help: "본인이 입력한 내용으로 표시돼요", kind: "text" },
  { key: "instructorYears", title: "강사 경력은 몇 년인가요?", kind: "number" },
  { key: "records", title: "개인 기록을 알려주세요", help: "건너뛰어도 괜찮아요", kind: "records" },
  { key: "mbti", title: "MBTI가 어떻게 되세요?", kind: "single" },
  { key: "teachingStyleTags", title: "수업 스타일을 골라주세요", help: "여러 개 고를 수 있어요", kind: "multi" },
  { key: "intro", title: "간단히 자기소개를 해주세요", kind: "text" },
  { key: "availableDays", title: "가능한 요일과 시간대를 알려주세요", kind: "multi" },
  { key: "desiredRate", title: "희망 단가가 있나요?", help: "선택 사항이에요", kind: "text" },
  { key: "photoPath", title: "프로필 사진을 올려주세요", kind: "photo" },
];

export function formatRecords(r: Records): { label: "STA" | "DYN" | "CWT" | "FIM"; value: string }[] {
  const out: { label: "STA" | "DYN" | "CWT" | "FIM"; value: string }[] = [];
  if (r.staSec != null) {
    out.push({ label: "STA", value: `${Math.floor(r.staSec / 60)}:${String(r.staSec % 60).padStart(2, "0")}` });
  }
  if (r.dynM != null) out.push({ label: "DYN", value: `${r.dynM}m` });
  if (r.cwtM != null) out.push({ label: "CWT", value: `${r.cwtM}m` });
  if (r.fimM != null) out.push({ label: "FIM", value: `${r.fimM}m` });
  return out;
}

/** "5:12" → 312, "312" → 312, 잘못된 값 → null */
export function parseStaInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{1,3}):(\d{1,2})$/.exec(t);
  if (m) {
    const sec = Number(m[2]);
    if (sec > 59) return null;
    return Number(m[1]) * 60 + sec;
  }
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

/** 미터 입력("150", "150m") → 숫자, 잘못된 값 → null */
export function parseMeterInput(s: string): number | null {
  const m = /^(\d{1,4})\s*m?$/i.exec(s.trim());
  return m ? Number(m[1]) : null;
}

export function resumeCompleteness(p: InstructorProfile): { done: number; total: number; missing: string[] } {
  const checks: [string, boolean][] = [
    ["성별", !!p.gender],
    ["나이대", !!p.ageBand],
    ["활동 지역", (p.regions ?? []).length > 0],
    ["교육 장소", (p.scopes ?? []).length > 0],
    ["자격 단체·등급", (p.certifications ?? []).length > 0],
    ["강사 경력", p.instructorYears != null],
    ["자기소개", !!p.intro?.trim()],
    ["가능 요일", (p.availableDays ?? []).length > 0],
    ["프로필 사진", !!p.photoPath],
  ];
  return {
    done: checks.filter(([, ok]) => ok).length,
    total: checks.length,
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
  };
}
