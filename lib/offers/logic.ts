import { jobErrorMessage } from "../jobs/logic.ts";
import type { JobStatus } from "../jobs/types.ts";
import type { InstructorFilterState, OfferStatus } from "./types.ts";

/** 한마디 최대 글자 수 — DB job_offers.message check(009)와 같다 */
export const OFFER_MESSAGE_MAX = 200;
/** 공고 하나당 보낼 수 있는 제안 = 모집 인원 × 이 수(009 send_offer) */
export const OFFERS_PER_HEADCOUNT = 5;
/** 강사 찾기 한 번에 불러오는 수(서버 최대 50) */
export const BROWSE_PAGE_SIZE = 20;

/** 센터가 보는 제안 상태. 거절은 "정중히 거절했어요"만(스펙 §4-2). */
export const OFFER_STATUS_CENTER: Record<OfferStatus, { label: string; tone: "ok" | "muted" | "ink" }> = {
  offered: { label: "답을 기다리는 중", tone: "ink" },
  accepted: { label: "수락했어요", tone: "ok" },
  declined: { label: "정중히 거절했어요", tone: "muted" },
  withdrawn: { label: "철회함", tone: "muted" },
  expired: { label: "공고 마감", tone: "muted" },
};

/** 강사가 보는 받은 제안 상태 */
export const OFFER_STATUS_INSTRUCTOR: Record<OfferStatus, { label: string; tone: "ok" | "muted" | "ink" }> = {
  offered: { label: "답을 기다리는 중", tone: "ink" },
  accepted: { label: "수락함", tone: "ok" },
  declined: { label: "거절함", tone: "muted" },
  withdrawn: { label: "센터가 제안을 거뒀어요", tone: "muted" },
  expired: { label: "공고가 마감됐어요", tone: "muted" },
};

const NETWORK = /fetch|network|timeout|timed out|abort|load failed/i;

/**
 * 제안 RPC 오류 → 사용자용 한국어. 서버(009) 메시지의 뜻을 보고 다음에 할 일을 알려 주는 문구로 바꾼다.
 * 모르는 오류는 jobErrorMessage(서버 한국어 메시지 그대로 / 코드별 기본)로.
 */
export function offerErrorMessage(err: { code?: string | null; message?: string | null } | null | undefined): string {
  const msg = err?.message ?? "";
  const code = err?.code ?? "";
  if (!code && NETWORK.test(msg)) return "네트워크 연결을 확인하고 다시 시도해 주세요";
  if (code === "23505" || msg.includes("이미 제안했어요")) return "이 강사에게는 이 공고로 이미 제안했어요";
  if (msg.includes("다 보냈어요")) return `${msg} 다른 공고를 골라 주세요`;
  if (msg.includes("이미 지원한 강사")) return "이 강사는 이미 이 공고에 지원했어요. 지원자 탭에서 확인해 주세요";
  if (msg.includes("모집 중인 공고로만") || msg.includes("모집이 끝난 공고")) return "모집이 끝난 공고예요. 목록을 새로 불러왔어요";
  if (msg.includes("모집 인원이 다 찼어요")) return "모집 인원이 다 찼어요. 목록을 새로 불러왔어요";
  if (msg.includes("제안할 수 있는 강사가 아니에요"))
    return "이 강사는 지금 제안을 받을 수 없어요(이력서 비공개 또는 이용 중지)";
  if (msg.includes("답을 기다리는 제안만")) return "이미 답했거나 철회·마감된 제안이에요. 목록을 새로 불러왔어요";
  if (msg.includes("제안을 찾을 수 없어요") || msg.includes("공고를 찾을 수 없어요"))
    return "찾을 수 없거나 내려간 제안이에요. 목록을 새로 불러왔어요";
  if (msg.includes("구독")) return msg; // 서버가 어떤 구독이 필요한지 알려 준다
  if (msg.includes("서류")) return `${msg}. 설정에서 서류를 확인해 주세요`;
  if (msg.includes("활성 계정만")) return "이용이 멈춘 계정이에요. 관리자에게 문의해 주세요";
  return jobErrorMessage(err);
}

/** 화면 필터 → browse_instructors p_filters. 빈 값은 넣지 않는다(서버가 지원하는 키만: 009). */
export function buildBrowseFilters(f: InstructorFilterState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const regions = f.regions.map((r) => r.trim()).filter(Boolean);
  if (regions.length > 0) out.regions = regions;
  const org = f.org?.trim();
  if (org) out.org = org;
  const level = f.level.trim();
  if (level) out.level = level;
  if (f.scope) out.scope = f.scope;
  const days = f.availableDays.filter(Boolean);
  if (days.length > 0) out.available_days = days;
  if (f.verifiedOnly) out.verified_only = true;
  return out;
}

export const EMPTY_INSTRUCTOR_FILTERS: InstructorFilterState = {
  regions: [],
  org: null,
  level: "",
  scope: null,
  availableDays: [],
  verifiedOnly: false,
};

/**
 * 채운 인원(선택한 지원 + 수락한 제안). 서버 요약(job_summary_rows, 009)의 remaining이 이미 둘 다 빼서 주므로
 * 인원 − 남은 자리로 구한다(화면에서 따로 세지 않는다).
 */
export function filledCount(job: { headcount: number; remaining: number }): number {
  return Math.max(job.headcount - Math.max(job.remaining, 0), 0);
}

/** 이 공고로 보낼 수 있는 제안 수(철회·거절·마감 포함 전부 센다) */
export function offerLimit(headcount: number): number {
  return headcount * OFFERS_PER_HEADCOUNT;
}

export function offersSentFor(offers: { jobId: string }[], jobId: string): number {
  let n = 0;
  for (const o of offers) if (o.jobId === jobId) n += 1;
  return n;
}

export type OfferJobBlock = "not_open" | "already_offered" | "already_applied" | "limit";

export const OFFER_JOB_BLOCK_LABEL: Record<OfferJobBlock, string> = {
  not_open: "모집 중이 아니에요",
  already_offered: "이미 제안했어요",
  already_applied: "이미 지원한 강사예요",
  limit: "보낼 수 있는 제안을 다 보냈어요",
};

/**
 * 제안 화면에서 이 공고를 고를 수 없는 이유(없으면 null). 안내용 — 최종 판단은 send_offer(서버).
 * applications는 이 센터 공고의 지원(취소 제외) 목록.
 */
export function offerJobBlock(
  job: { id: string; status: JobStatus; headcount: number },
  instructorId: string,
  offers: { jobId: string; instructorId: string }[],
  applications: { jobId: string; instructorId: string; status: string }[],
): OfferJobBlock | null {
  if (job.status !== "open") return "not_open";
  if (offers.some((o) => o.jobId === job.id && o.instructorId === instructorId)) return "already_offered";
  if (applications.some((a) => a.jobId === job.id && a.instructorId === instructorId && a.status !== "withdrawn"))
    return "already_applied";
  if (offersSentFor(offers, job.id) >= offerLimit(job.headcount)) return "limit";
  return null;
}

/** 받은 제안에 [수락]을 보일지: 답 대기 + 공고가 아직 모집 중. 최종 판단은 respond_offer(서버). */
export function canAccept(o: { status: OfferStatus; job: { status: JobStatus } | null }): boolean {
  return o.status === "offered" && o.job?.status === "open";
}

/** [거절]은 답 대기면 언제나(서버도 거절은 늘 받는다) */
export function canDecline(o: { status: OfferStatus }): boolean {
  return o.status === "offered";
}

export type ReceivedGroup = "pending" | "accepted" | "past";

/** 받은 제안 묶음: 답 대기 / 수락함 / 지난 제안(거절·철회·마감) */
export function receivedGroup(o: { status: OfferStatus }): ReceivedGroup {
  if (o.status === "offered") return "pending";
  if (o.status === "accepted") return "accepted";
  return "past";
}

/** 이름 → 사진 대신 쓰는 첫 글자. 비면 "?" */
export function initialOf(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "?";
  return Array.from(s)[0].toUpperCase();
}
