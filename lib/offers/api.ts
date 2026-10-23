import { createClient } from "@/lib/supabase/client";
import { getJobSummary } from "@/lib/jobs/api";
import type { JobSummary } from "@/lib/jobs/types";
import { BROWSE_PAGE_SIZE, buildBrowseFilters, offerErrorMessage } from "./logic";
import { browseInstructorFromRow, offerFromRow } from "./mappers";
import type { BrowseInstructor, InstructorFilterState, Offer, ReceivedOffer } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 읽기 오류는 던진다(화면이 다시 시도 안내). 메시지는 한국어로. 요청 내용은 로그에 남기지 않는다. */
function fail(err: { code?: string | null; message?: string | null }): never {
  throw new Error(offerErrorMessage(err));
}

/** 쓰기 공통: 서버 오류·네트워크 예외 모두 { error }로. */
async function write(fn: () => Promise<{ error: any }>): Promise<{ error?: string }> {
  try {
    const { error } = await fn();
    return error ? { error: offerErrorMessage(error) } : {};
  } catch (e) {
    return { error: offerErrorMessage({ message: e instanceof Error ? e.message : "network" }) };
  }
}

const OFFER_COLS = "id, job_id, center_id, instructor_id, message, status, created_at, responded_at";

/** 기한 지난 공고 정리(남은 제안도 마감). best effort — 오류는 무시. */
async function expireJobsBestEffort(): Promise<void> {
  try {
    await (createClient() as any).rpc("expire_jobs");
  } catch {
    /* ignore */
  }
}

// ---------- 센터 ----------

/**
 * 강사 둘러보기(009). 구독 중인 활성 센터만 — 아니면 서버가 42501로 거부하고, 그 한국어 문구를 던진다.
 * 응답에는 공개 이력서 칸 + 유효한 서류 사실만 있다(연락처 없음).
 */
export async function browseInstructors(filters: InstructorFilterState, offset = 0): Promise<BrowseInstructor[]> {
  const { data, error } = await (createClient() as any).rpc("browse_instructors", {
    p_filters: buildBrowseFilters(filters),
    p_limit: BROWSE_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) fail(error);
  return ((data ?? []) as any[]).map(browseInstructorFromRow);
}

/** 내 공고들로 보낸 제안(최신순). RLS: 활성 + 구독 공고 주인만 — 구독이 없으면 빈 목록. 받은 강사 이름은 볼 수 있을 때만. */
export async function listSentOffers(jobIds: string[]): Promise<Offer[]> {
  if (jobIds.length === 0) return [];
  const { data, error } = await (createClient() as any)
    .from("job_offers")
    .select(`${OFFER_COLS}, profiles(display_name)`)
    .in("job_id", jobIds)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as any[]).map(offerFromRow);
}

export async function sendOffer(jobId: string, instructorId: string, message?: string | null) {
  return write(() =>
    (createClient() as any).rpc("send_offer", {
      p_job: jobId,
      p_instructor: instructorId,
      p_message: message?.trim() || null,
    }),
  );
}

export async function withdrawOffer(offerId: string) {
  return write(() => (createClient() as any).rpc("withdraw_offer", { p_offer: offerId }));
}

/**
 * 제안을 수락한 강사의 연락처(009 get_offer_contact). 공고 주인 + 구독 + 수락 + 강사 활성일 때만 1행, 아니면 null.
 * 결과는 연락처 카드 컴포넌트 state에만 둔다(올리거나 저장·로그하지 않는다).
 */
export async function getOfferContact(offerId: string): Promise<{ phone: string | null; email: string | null } | null> {
  const { data, error } = await (createClient() as any).rpc("get_offer_contact", { p_offer: offerId });
  if (error) {
    if (error.code === "42501") return null;
    fail(error);
  }
  const row = ((data ?? []) as any[])[0];
  return row ? { phone: row.phone ?? null, email: row.email ?? null } : null;
}

// ---------- 강사 ----------

/** 내가 받은 제안(최신순) + 공고 요약(숨김·정지 센터 공고는 job=null). */
export async function listReceivedOffers(): Promise<ReceivedOffer[]> {
  await expireJobsBestEffort();
  const sb = createClient();
  const { data: s } = await sb.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return [];
  const { data, error } = await (sb as any)
    .from("job_offers")
    .select(OFFER_COLS)
    .eq("instructor_id", uid)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  const offers = ((data ?? []) as any[]).map(offerFromRow);
  const jobIds = Array.from(new Set(offers.map((o) => o.jobId)));
  // 요약 읽기 오류(네트워크 등)는 던진다 — "내려간 공고"로 잘못 보이지 않게. 숨김·정지 공고는 오류 없이 null.
  const summaries = await Promise.all(jobIds.map((id) => getJobSummary(id)));
  const byId = new Map<string, JobSummary>();
  summaries.forEach((j) => j && byId.set(j.id, j));
  return offers.map((o) => ({ ...o, job: byId.get(o.jobId) ?? null }));
}

export async function respondOffer(offerId: string, accept: boolean) {
  return write(() => (createClient() as any).rpc("respond_offer", { p_offer: offerId, p_accept: accept }));
}
