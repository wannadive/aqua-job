import { createClient } from "@/lib/supabase/client";
import { getDeviceKey } from "@/lib/jobs/device-key";
import type { DocRecord } from "@/lib/verification/types";
import { countApplications, jobErrorMessage } from "./logic";
import {
  applicationFromRow,
  centerJobHistoryFromRow,
  centerPublicProfileFromRow,
  jobDetailFromRow,
  jobSummaryFromRow,
  publicFactToDoc,
} from "./mappers";
import type {
  CenterJobHistoryItem,
  CenterPublicProfile,
  JobApplication,
  JobDetail,
  JobFilters,
  JobInput,
  JobSummary,
  MyApplication,
  RequirementRule,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 읽기 RPC/조회 오류는 던진다(화면이 처리). 메시지는 한국어로 바꿔 둔다. */
function fail(err: { code?: string | null; message?: string | null }): never {
  throw new Error(jobErrorMessage(err));
}

/** 마감 지난 공고 저장 상태 정리. 읽기 전에 부르는 best effort — 오류는 무시한다. */
async function expireJobsBestEffort(): Promise<void> {
  try {
    await (createClient() as any).rpc("expire_jobs");
  } catch {
    /* ignore */
  }
}

function toPayload(input: JobInput) {
  return {
    job_type: input.jobType,
    title: input.title,
    region: input.region,
    venue: input.venue ?? null,
    class_date: input.classDate ?? null,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    work_days: input.workDays ?? [],
    work_time: input.workTime ?? null,
    tour_start: input.tourStart ?? null,
    tour_end: input.tourEnd ?? null,
    destination: input.destination ?? null,
    destination_kind: input.destinationKind ?? null,
    covers_flight: input.coversFlight ?? false,
    covers_lodging: input.coversLodging ?? false,
    pay_amount: input.payAmount ?? null,
    pay_unit: input.payAmount == null ? null : (input.payUnit ?? null),
    headcount: input.headcount,
    requirement_tags: input.requirementTags ?? [],
    description: input.description,
    deadline: input.deadline,
  };
}

// ---------- 읽기 (공개) ----------

export async function listPublicJobs(filters: JobFilters = {}): Promise<JobSummary[]> {
  const { data, error } = await (createClient() as any).rpc("list_public_jobs", {
    p_type: filters.type ?? null,
    p_region: filters.region ?? null,
    p_paid_only: filters.paidOnly ?? false,
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
  });
  if (error) fail(error);
  return ((data ?? []) as any[]).map(jobSummaryFromRow);
}

export async function getJobSummary(id: string): Promise<JobSummary | null> {
  const { data, error } = await (createClient() as any).rpc("get_job_summary", { p_job: id });
  if (error) fail(error);
  const row = ((data ?? []) as any[])[0];
  return row ? jobSummaryFromRow(row) : null;
}

/** 로그인 + 상세 열람 가능일 때만. 권한이 없으면 던진다(잠금 화면은 호출 전에 판단). */
export async function getJobDetail(id: string): Promise<JobDetail | null> {
  const { data, error } = await (createClient() as any).rpc("get_job_detail", { p_job: id });
  if (error) fail(error);
  const row = ((data ?? []) as any[])[0];
  return row ? jobDetailFromRow(row) : null;
}

/** 조회수 기록. 실패해도 화면에는 영향 없음(오류는 삼킨다). 로그인했으면 id, 아니면 기기 키로 센다. */
export async function recordJobView(id: string): Promise<void> {
  try {
    await (createClient() as any).rpc("record_job_view", { p_job: id, p_device_key: getDeviceKey() || null });
  } catch {
    /* ignore */
  }
}

export async function fetchPaidMode(): Promise<boolean> {
  const { data, error } = await createClient().from("app_settings").select("value").eq("key", "paid_mode").maybeSingle();
  if (error) fail(error);
  return (data as any)?.value === true;
}

export async function fetchRequirementRules(): Promise<RequirementRule[]> {
  const { data, error } = await createClient().from("requirement_rules").select("action, doc_type");
  if (error) fail(error);
  return ((data ?? []) as any[]).map((r) => ({ action: r.action, docType: r.doc_type }));
}

/** 이 사람의 서류 사실(확인된 유효 서류만). publicFacts/factLabel에 그대로 넣는다. */
export async function getPublicFacts(userId: string): Promise<DocRecord[]> {
  const { data, error } = await (createClient() as any).rpc("get_public_facts", { p_user: userId });
  if (error) fail(error);
  return ((data ?? []) as any[]).map((r) => publicFactToDoc(r, userId));
}

export async function getCenterPublicProfile(centerId: string): Promise<CenterPublicProfile | null> {
  const { data, error } = await (createClient() as any).rpc("get_center_public_profile", { p_center: centerId });
  if (error) fail(error);
  const row = ((data ?? []) as any[])[0];
  return row ? centerPublicProfileFromRow(row) : null;
}

export async function listCenterJobHistory(centerId: string): Promise<CenterJobHistoryItem[]> {
  const { data, error } = await (createClient() as any).rpc("list_center_job_history", { p_center: centerId });
  if (error) fail(error);
  return ((data ?? []) as any[]).map(centerJobHistoryFromRow);
}

// ---------- 읽기 (로그인) ----------

/** 내(센터) 공고. 저장 상태를 맞추려고 expire_jobs를 먼저 부른다. 일부 공고만 못 읽으면 나머지는 보여 주고 failed 수를 돌려준다. */
export async function listMyJobs(): Promise<{ jobs: JobSummary[]; failed: number }> {
  await expireJobsBestEffort();
  const sb = createClient();
  const { data: s } = await sb.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return { jobs: [], failed: 0 };
  // job_posts는 주인만 직접 읽을 수 있고, 요약 칸은 list_center_job_history로는 부족해서 id별 요약을 모은다.
  const { data, error } = await (sb as any).from("job_posts").select("id").eq("owner_id", uid).order("created_at", { ascending: false });
  if (error) fail(error);
  const ids = ((data ?? []) as any[]).map((r) => r.id as string);
  const settled = await Promise.allSettled(ids.map((id) => getOwnSummary(id)));
  const jobs: JobSummary[] = [];
  let failed = 0;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      if (r.value) jobs.push(r.value);
    } else failed += 1;
  }
  return { jobs, failed };
}

/** 내 공고들의 지원 현황(공고별 지원·대기·선택 수). 오류는 던진다. */
export async function fetchMyApplicantCounts(jobIds: string[]) {
  if (jobIds.length === 0) return countApplications([]);
  const { data, error } = await (createClient() as any).from("job_applications").select("job_id, status").in("job_id", jobIds);
  if (error) fail(error);
  return countApplications(((data ?? []) as any[]).map((r) => ({ jobId: r.job_id as string, status: r.status as string })));
}

/** 숨김 공고도 주인에게는 보이도록 get_job_detail(주인·관리자는 숨김 포함)로 요약 칸을 읽는다. */
async function getOwnSummary(id: string): Promise<JobSummary | null> {
  const { data, error } = await (createClient() as any).rpc("get_job_detail", { p_job: id });
  if (error) fail(error);
  const row = ((data ?? []) as any[])[0];
  return row ? jobSummaryFromRow(row) : null;
}

/** 내 지원 현황(최신순). 공고 요약은 공개 요약 RPC로 붙인다(숨김·정지 센터 공고는 job=null). */
export async function listMyApplications(): Promise<MyApplication[]> {
  await expireJobsBestEffort();
  const sb = createClient();
  const { data: s } = await sb.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return [];
  const { data, error } = await (sb as any)
    .from("job_applications")
    .select("id, job_id, instructor_id, message, status, created_at, decided_at")
    .eq("instructor_id", uid)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  const apps = ((data ?? []) as any[]).map(applicationFromRow);
  const jobIds = Array.from(new Set(apps.map((a) => a.jobId)));
  const summaries = await Promise.all(jobIds.map((id) => getJobSummary(id).catch(() => null)));
  const byId = new Map<string, JobSummary>();
  summaries.forEach((j) => j && byId.set(j.id, j));
  return apps.map((a) => ({ ...a, job: byId.get(a.jobId) ?? null }));
}

/** 내 공고의 지원자(최신순, 지원 취소 포함 — 화면에서 거른다). 이름은 profiles 조인(센터가 볼 수 있는 경우만). */
export async function listApplicants(jobId: string): Promise<JobApplication[]> {
  const { data, error } = await (createClient() as any)
    .from("job_applications")
    .select("id, job_id, instructor_id, message, status, created_at, decided_at, profiles(display_name)")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as any[]).map(applicationFromRow);
}

/** 선택된 지원자의 연락처. 권한이 없거나(42501) 대상이 아니면 null. */
export async function getApplicantContact(appId: string): Promise<{ phone: string | null; email: string | null } | null> {
  const { data, error } = await (createClient() as any).rpc("get_applicant_contact", { p_app: appId });
  if (error) {
    if (error.code === "42501") return null;
    fail(error);
  }
  const row = ((data ?? []) as any[])[0];
  return row ? { phone: row.phone ?? null, email: row.email ?? null } : null;
}

// ---------- 쓰기: 모두 { error?: string } ----------

export async function createJob(input: JobInput): Promise<{ id?: string; error?: string }> {
  const { data, error } = await (createClient() as any).rpc("create_job_post", { payload: toPayload(input) });
  if (error) return { error: jobErrorMessage(error) };
  return { id: data as string };
}

export async function updateJob(id: string, input: JobInput): Promise<{ error?: string }> {
  const { error } = await (createClient() as any).rpc("update_job_post", { p_job: id, payload: toPayload(input) });
  return error ? { error: jobErrorMessage(error) } : {};
}

export async function closeJob(id: string): Promise<{ error?: string }> {
  const { error } = await (createClient() as any).rpc("close_job_post", { p_job: id });
  return error ? { error: jobErrorMessage(error) } : {};
}

export async function applyToJob(id: string, message?: string | null): Promise<{ error?: string }> {
  const { error } = await (createClient() as any).rpc("apply_to_job", { p_job: id, p_message: message?.trim() || null });
  return error ? { error: jobErrorMessage(error) } : {};
}

export async function withdrawApplication(appId: string): Promise<{ error?: string }> {
  const { error } = await (createClient() as any).rpc("withdraw_application", { p_app: appId });
  return error ? { error: jobErrorMessage(error) } : {};
}

export async function selectApplicant(appId: string): Promise<{ error?: string }> {
  const { error } = await (createClient() as any).rpc("select_applicant", { p_app: appId });
  return error ? { error: jobErrorMessage(error) } : {};
}
