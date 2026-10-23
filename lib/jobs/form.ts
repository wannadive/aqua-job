import { REGION_OPTIONS } from "../talent-profile/config.ts";
import { JOB_LIMITS } from "./config.ts";
import { maxDeadline } from "./logic.ts";
import type { DestinationKind, JobInput, JobType, PayUnit } from "./types.ts";

export interface Draft {
  title: string;
  region: string;
  venue: string;
  classDate: string;
  startTime: string;
  endTime: string;
  workDays: string[];
  workTime: string;
  tourStart: string;
  tourEnd: string;
  destination: string;
  destinationKind: DestinationKind;
  coversFlight: boolean;
  coversLodging: boolean;
  negotiable: boolean;
  payAmount: string;
  payUnit: PayUnit;
  headcount: string;
  requirementTags: string[];
  description: string;
  deadline: string;
}

export const EMPTY: Draft = {
  title: "",
  region: "",
  venue: "",
  classDate: "",
  startTime: "",
  endTime: "",
  workDays: [],
  workTime: "",
  tourStart: "",
  tourEnd: "",
  destination: "",
  destinationKind: "domestic",
  coversFlight: false,
  coversLodging: false,
  negotiable: true,
  payAmount: "",
  payUnit: "per_class",
  headcount: "1",
  requirementTags: [],
  description: "",
  deadline: "",
};

/** 입력 검사. 문제가 없으면 null. */
export function validateDraft(type: JobType, d: Draft, today: string, minHeadcount = 0): string | null {
  const title = d.title.trim();
  if (title.length < 2) return "제목을 2자 이상 입력해 주세요";
  if (title.length > 60) return "제목은 60자까지예요";
  if (!d.region) return "지역을 골라 주세요";
  if (!(REGION_OPTIONS as readonly string[]).includes(d.region)) return "지역은 목록에서 골라 주세요";
  if (d.venue.trim().length > JOB_LIMITS.maxPlaceChars) return `장소는 ${JOB_LIMITS.maxPlaceChars}자까지예요`;
  if (type === "affiliation" && d.workTime.trim().length > JOB_LIMITS.maxPlaceChars) {
    return `근무 시간은 ${JOB_LIMITS.maxPlaceChars}자까지예요`;
  }
  if (type === "tour" && d.destination.trim().length > JOB_LIMITS.maxPlaceChars) {
    return `여행지는 ${JOB_LIMITS.maxPlaceChars}자까지예요`;
  }
  if (d.requirementTags.some((t) => t.trim().length > JOB_LIMITS.maxTagChars)) {
    return `자격 조건은 하나에 ${JOB_LIMITS.maxTagChars}자까지예요`;
  }
  if (type === "lesson") {
    if (!d.classDate) return "수업 날짜를 입력해 주세요";
    if (d.classDate < today) return "수업 날짜는 오늘 이후여야 해요";
    if (d.startTime && d.endTime && d.endTime <= d.startTime) return "끝나는 시간이 시작 시간보다 늦어야 해요";
  }
  if (type === "affiliation" && d.workDays.length === 0) return "근무 요일을 골라 주세요";
  if (type === "tour") {
    if (!d.tourStart || !d.tourEnd) return "투어 일정을 입력해 주세요";
    if (d.tourStart < today) return "투어 시작일은 오늘 이후여야 해요";
    if (d.tourEnd < d.tourStart) return "투어 끝나는 날이 시작일보다 빠를 수 없어요";
    if (!d.destination.trim()) return "여행지를 입력해 주세요";
  }
  if (!d.negotiable) {
    const n = Number(d.payAmount);
    if (!Number.isInteger(n) || n <= 0) return "단가를 숫자로 입력하거나 협의로 바꿔 주세요";
  }
  const h = Number(d.headcount);
  if (!Number.isInteger(h) || h < 1 || h > 20) return "모집 인원은 1~20명이에요";
  if (h < minHeadcount) return `이미 ${minHeadcount}명을 선택해서 ${minHeadcount}명보다 적게 줄일 수 없어요`;
  if (!d.description.trim()) return "상세 설명을 입력해 주세요";
  if (!d.deadline) return "마감일을 입력해 주세요";
  if (d.deadline < today) return "마감일은 오늘 이후여야 해요";
  if (d.deadline > maxDeadline(today)) return `마감일은 오늘부터 ${JOB_LIMITS.maxDeadlineDays}일 안으로 골라 주세요`;
  const start = type === "lesson" ? d.classDate : type === "tour" ? d.tourStart : "";
  if (start && d.deadline > start) return "마감일은 일정 시작일 이전이어야 해요";
  return null;
}

export function draftToInput(type: JobType, d: Draft): JobInput {
  const base: JobInput = {
    jobType: type,
    title: d.title.trim(),
    region: d.region,
    venue: d.venue.trim() || null,
    payAmount: d.negotiable ? null : Number(d.payAmount),
    payUnit: d.negotiable ? null : d.payUnit,
    headcount: Number(d.headcount),
    requirementTags: d.requirementTags,
    description: d.description.trim(),
    deadline: d.deadline,
  };
  if (type === "lesson") {
    return { ...base, classDate: d.classDate, startTime: d.startTime || null, endTime: d.endTime || null };
  }
  if (type === "affiliation") {
    return { ...base, workDays: d.workDays, workTime: d.workTime.trim() || null };
  }
  return {
    ...base,
    tourStart: d.tourStart,
    tourEnd: d.tourEnd,
    destination: d.destination.trim(),
    destinationKind: d.destinationKind,
    coversFlight: d.coversFlight,
    coversLodging: d.coversLodging,
  };
}

