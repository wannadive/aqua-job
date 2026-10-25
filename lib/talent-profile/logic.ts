import { CERT_LEVELS, CERT_ORG_OPTIONS, type CertOrg } from "./config.ts";
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

export const STA_MAX_SEC = 900; // 15:00
export const METER_MAX = 300;

/** "5:12" → 312, "312" → 312, 잘못된 값 → null */
export function parseStaInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{1,3}):(\d{1,2})$/.exec(t);
  if (m) {
    const sec = Number(m[2]);
    if (sec > 59) return null;
    const v = Number(m[1]) * 60 + sec;
    return v > STA_MAX_SEC ? null : v;
  }
  if (/^\d+$/.test(t)) return Number(t) > STA_MAX_SEC ? null : Number(t);
  return null;
}

/** 미터 입력("150", "150m") → 숫자, 잘못된 값 → null */
export function parseMeterInput(s: string): number | null {
  const m = /^(\d{1,4})\s*m?$/i.exec(s.trim());
  return m && Number(m[1]) <= METER_MAX ? Number(m[1]) : null;
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

// ---- 자격 단체·등급 (목록은 config.ts CERT_LEVELS 한 곳)

/** 서버 필터와 같은 비교(lower(btrim())) */
const certKey = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** 저장된 단체 글자 → 목록의 단체(대소문자·앞뒤 공백 무시). 목록에 없으면 null */
export function canonicalCertOrg(org: string | null | undefined): CertOrg | null {
  const k = certKey(org);
  if (!k) return null;
  return CERT_ORG_OPTIONS.find((o) => o.toLowerCase() === k) ?? null;
}

/** 이 단체에서 고를 수 있는 등급 목록("기타"·목록에 없는 단체는 빈 목록 = 직접 입력) */
export function certLevelOptions(org: string | null | undefined): readonly string[] {
  const o = canonicalCertOrg(org);
  return o ? CERT_LEVELS[o] : [];
}

/**
 * 저장된 등급을 화면 칸으로: 비었음 / 목록의 등급(서버 비교와 같은 기준으로 맞춘 목록 글자) / 직접 입력(적힌 글자 그대로).
 * 예전에 직접 적은 값이 목록에 없으면 "기타(직접 입력)"에 글자를 그대로 둔다.
 */
export type CertLevelChoice = { kind: "none" } | { kind: "list"; value: string } | { kind: "other"; text: string };
export function certLevelChoice(org: string | null | undefined, level: string | null | undefined): CertLevelChoice {
  const k = certKey(level);
  if (!k) return { kind: "none" };
  const hit = certLevelOptions(org).find((l) => l.toLowerCase() === k);
  return hit ? { kind: "list", value: hit } : { kind: "other", text: level ?? "" };
}

/** 자격 한 줄 표시. 등급이 단체 이름으로 시작하면(AIDA2) 단체를 두 번 쓰지 않고, 기타 단체는 적은 글자만 */
export function formatCert(c: { org: string; level: string }): string {
  const org = c.org.trim();
  const level = c.level.trim();
  // "기타" 단체는 적은 등급(단체 이름 포함)만 보인다
  if (org === "기타") return level || org;
  if (org && level.toLowerCase().startsWith(org.toLowerCase())) return level;
  return [org, level].filter(Boolean).join(" ");
}

/**
 * 등급 칸이 직접 입력 모드인가. 한 번 직접 입력 모드에 들어간 줄(otherOpen)은 적은 글자가 목록 값과 같아지거나
 * 비어도 입력 칸을 유지한다(입력 중 칸이 사라져 폰 키보드가 닫히지 않게). 목록이 없는 단체는 늘 직접 입력.
 */
export function isCertLevelTyping(org: string | null | undefined, level: string | null | undefined, otherOpen: boolean): boolean {
  return certLevelOptions(org).length === 0 || otherOpen || certLevelChoice(org, level).kind === "other";
}

/**
 * 단체를 고른 뒤의 등급. 단체가 비어 있던 예전 줄은 적어 둔 등급을 지우지 않는다(목록 값이면 그 칸, 아니면 직접 입력 칸에).
 * 이미 단체가 있던 줄에서 다른 단체로 바꾸면 등급은 새로 고른다.
 */
export function levelAfterOrgPick(prevOrg: string | null | undefined, level: string, nextOrg: string): { level: string; otherOpen: boolean } {
  if (!(prevOrg ?? "").trim() && level.trim()) {
    return { level, otherOpen: certLevelChoice(nextOrg, level).kind === "other" };
  }
  return { level: "", otherOpen: false };
}
