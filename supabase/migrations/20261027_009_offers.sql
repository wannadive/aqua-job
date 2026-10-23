-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)의 SQL Editor에서 실행 — 워너다이브 프로젝트에서 실행하지 말 것
-- =====================================================================
-- 아쿠아잡 009: 제안(센터 → 강사) — 강사 둘러보기 · 제안 보내기/철회 · 수락/거절 · 수락 후 연락처
-- 001 → … → 008을 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(create table if not exists, create index if not exists,
-- drop policy if exists → create policy, create or replace — 반환 칸·인자가 그대로인 함수만 바꾼다).
-- 재정의한 것은 모두 최신 정의를 복사해 고쳤다:
--   job_effective_status(005) · close_job_with_reason(005) · expire_jobs(005) · job_summary_rows(006)
--   · apply_to_job(006) · update_job_post(007) · select_applicant(007) · job_can_view_talent(008)
--
-- 규칙
-- 1) job_offers: 센터가 자기 공고 하나를 골라 강사에게 보내는 제안. 쓰기는 RPC만(쓰기 정책 없음).
--    조회: 받은 강사 본인(활성) · 관리자 · 그 공고의 주인(활성 + 센터 구독 job_center_entitled()).
--    상태: offered(보냄) → accepted(수락) | declined(거절) | withdrawn(센터가 철회) | expired(공고 마감).
--    responded_at = 상태가 offered에서 바뀐 시각(수락·거절·철회·마감 모두).
-- 2) 같은 공고로 같은 강사에게는 제안 한 번뿐(철회·거절 뒤에도 다시 못 보냄) — unique(job_id, instructor_id).
--    공고 하나당 보낼 수 있는 제안 = 모집 인원 × 5(철회·거절·마감 포함 전부 센다).
--    이미 그 공고에 지원한(취소 제외) 강사에게는 제안할 수 없다. 반대로 그 공고로 받은 제안이
--    보냄·수락 상태면 그 공고에 지원할 수 없다(apply_to_job) — 한 사람이 인원을 두 번 차지하지 않게.
-- 3) 모집 인원 = 선택한 지원 + 수락한 제안(job_filled_count). 공고 상태(full)·남은 자리·공고 수정의
--    인원 하한·지원자 선택·제안 수락이 모두 이 수를 쓴다. 수락·선택은 공고 행을 FOR UPDATE로 잠근 뒤 센다.
--    인원이 차면 공고를 closed/full로 — 남은 지원함 → 미선택, 남은 제안(보냄) → 마감(expired).
-- 4) 공고가 마감되면(직접 마감·기한 지남·인원 참) 보냄 상태 제안은 전부 expired.
-- 5) 연락처가 열리는 경로는 "선택"(get_applicant_contact)과 "제안 수락"(get_offer_contact) 둘뿐.
--    get_offer_contact = get_applicant_contact(007)와 같은 확인: 공고 주인(활성) + 센터 구독 + 수락 + 강사 활성.
-- 6) 강사 둘러보기(browse_instructors): 활성 + 구독 센터만. 공개 이력서(is_public)·온보딩 끝·활성·강사 역할인
--    사람만, 이력서 공개 칸 + 서류 사실(유효한 것)만. 연락처·비공개 칸(MBTI·지난 센터 등) 없음.
-- 7) 강사 정보 규칙(job_can_view_talent, 008)에 "내 공고의 제안을 수락한 강사"를 더한다
--    (보낸 제안만으로는 열리지 않는다 — 제안은 공개 이력서 강사에게만 갈 수 있어서 이미 볼 수 있다).
-- 무료 기간(paid_mode=false)에는 구독 함수가 true라 활성 센터·강사 모두 쓸 수 있다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_posts(id) on delete cascade,
  center_id uuid not null references public.centers(id) on delete cascade,
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  message text check (message is null or char_length(message) <= 200),
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'withdrawn', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz null,
  constraint job_offers_job_instructor_key unique (job_id, instructor_id)
);

create index if not exists job_offers_instructor_idx on public.job_offers (instructor_id, created_at desc);
create index if not exists job_offers_job_status_idx on public.job_offers (job_id, status);
create index if not exists job_offers_center_idx on public.job_offers (center_id, created_at desc);

alter table public.job_offers enable row level security;

-- 직접 쓰기는 정책이 없어 막혀 있지만, 권한도 걷어 둔다(RPC만 쓴다)
revoke all on public.job_offers from anon;
revoke insert, update, delete on public.job_offers from authenticated;

-- 조회: 받은 강사 본인(활성) · 관리자 · 공고 주인(활성 + 센터 구독)
drop policy if exists job_offers_select on public.job_offers;
create policy job_offers_select on public.job_offers
  for select to authenticated
  using (
    (instructor_id = (select auth.uid()) and (select public.is_active()))
    or (select public.is_admin())
    or (
      (select public.is_active())
      and (select public.job_center_entitled())
      and exists (
        select 1 from public.job_posts j
        where j.id = job_offers.job_id and j.owner_id = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------
-- 2. 모집 인원 수: 선택한 지원 + 수락한 제안
--    SECURITY INVOKER: 직접 부르면 RLS가 그대로(볼 수 있는 행만 센다). 아래 SECURITY DEFINER RPC 안에서는
--    소유자 권한으로 돌아 정확한 수를 센다(job_effective_status와 같은 방식).
-- ---------------------------------------------------------------------
create or replace function public.job_filled_count(p_job uuid)
returns int
language sql
stable
set search_path = public
as $$
  select (
    (select count(*) from public.job_applications a where a.job_id = p_job and a.status = 'selected')
    + (select count(*) from public.job_offers o where o.job_id = p_job and o.status = 'accepted')
  )::int;
$$;

revoke execute on function public.job_filled_count(uuid) from public, anon;
grant execute on function public.job_filled_count(uuid) to authenticated;

-- 공고 상태 (005 정의 기준): 인원 참(full) = 선택 + 수락한 제안 ≥ 인원.
-- TS lib/jobs의 jobDisplayStatus와 같은 규칙이어야 한다(selectedCount에 수락한 제안을 더해 넘긴다).
create or replace function public.job_effective_status(j public.job_posts)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when j.status = 'hidden' then 'hidden'
    when j.status = 'closed' then
      case j.closed_reason when 'full' then 'full' when 'expired' then 'expired' else 'closed' end
    when (now() at time zone 'Asia/Seoul')::date > j.deadline
      or (j.job_type = 'lesson' and (now() at time zone 'Asia/Seoul')::date > j.class_date)
      or (j.job_type = 'tour' and (now() at time zone 'Asia/Seoul')::date > j.tour_start)
      then 'expired'
    when public.job_filled_count(j.id) >= j.headcount then 'full'
    else 'open'
  end;
$$;

revoke execute on function public.job_effective_status(public.job_posts) from public, anon;
grant execute on function public.job_effective_status(public.job_posts) to authenticated;

-- 요약 행 (006 정의 기준): 남은 자리 = 인원 − (선택 + 수락한 제안)
create or replace function public.job_summary_rows(p_job uuid, p_center_id uuid, p_public boolean)
returns table (
  id uuid,
  owner_id uuid,
  center_id uuid,
  center_name text,
  job_type text,
  title text,
  region text,
  venue text,
  class_date date,
  start_time time,
  end_time time,
  work_days text[],
  work_time text,
  tour_start date,
  tour_end date,
  destination text,
  destination_kind text,
  covers_flight boolean,
  covers_lodging boolean,
  pay_amount int,
  pay_unit text,
  headcount int,
  remaining int,
  requirement_tags text[],
  deadline date,
  view_count int,
  created_at timestamptz,
  edited_at timestamptz,
  effective_status text
)
language sql
stable
set search_path = public
as $$
  select
    j.id, j.owner_id, j.center_id,
    coalesce(nullif(btrim(cp.center_name), ''), p.display_name),
    j.job_type, j.title, j.region, j.venue,
    j.class_date, j.start_time, j.end_time,
    j.work_days, j.work_time,
    j.tour_start, j.tour_end, j.destination, j.destination_kind, j.covers_flight, j.covers_lodging,
    j.pay_amount, j.pay_unit, j.headcount,
    greatest(j.headcount - public.job_filled_count(j.id), 0),
    j.requirement_tags, j.deadline, j.view_count, j.created_at, j.edited_at,
    public.job_effective_status(j)
  from public.job_posts j
  join public.profiles p on p.id = j.owner_id
  left join public.center_profiles cp on cp.user_id = j.owner_id
  where (p_job is null or j.id = p_job)
    and (p_center_id is null or j.center_id = p_center_id)
    and (not p_public or (j.status <> 'hidden' and p.account_status = 'active'));
$$;

revoke execute on function public.job_summary_rows(uuid, uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 마감: 남은 제안(보냄)도 정리
-- ---------------------------------------------------------------------

-- 공고 마감 (005 정의 기준): 남은 '지원함' → '미선택', 남은 '보냄' 제안 → '마감'.
-- 호출하는 쪽이 공고 행을 잠근 뒤 부른다.
create or replace function public.close_job_with_reason(p_job uuid, p_reason text)
returns void
language sql
volatile
set search_path = public
as $$
  update public.job_posts set status = 'closed', closed_reason = p_reason
  where id = p_job and status = 'open';

  update public.job_applications set status = 'not_selected', decided_at = now()
  where job_id = p_job and status = 'applied';

  update public.job_offers set status = 'expired', responded_at = now()
  where job_id = p_job and status = 'offered';
$$;

revoke execute on function public.close_job_with_reason(uuid, text) from public, anon, authenticated;

-- 기한 지난 공고 정리 (005 정의 기준) + 남은 '보냄' 제안 → '마감'
create or replace function public.expire_jobs()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if not public.is_active() then
    return 0;
  end if;

  select coalesce(array_agg(x.id), '{}') into v_ids
  from (
    select j.id
    from public.job_posts j
    where j.status = 'open' and public.job_effective_status(j) = 'expired'
    order by j.id
    for update skip locked
  ) x;

  update public.job_posts set status = 'closed', closed_reason = 'expired'
  where id = any(v_ids);

  update public.job_applications set status = 'not_selected', decided_at = now()
  where job_id = any(v_ids) and status = 'applied';

  update public.job_offers set status = 'expired', responded_at = now()
  where job_id = any(v_ids) and status = 'offered';

  return cardinality(v_ids);
end;
$$;

revoke execute on function public.expire_jobs() from public, anon;
grant execute on function public.expire_jobs() to authenticated;

-- ---------------------------------------------------------------------
-- 4. 인원을 세는 기존 RPC: 수락한 제안도 센다
-- ---------------------------------------------------------------------

-- 공고 수정 (007 정의 기준): 인원은 이미 선택·수락한 수보다 적게 못 줄인다. 같게 줄이면 인원 마감.
create or replace function public.update_job_post(p_job uuid, payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.job_posts;
  r public.job_posts;
  v_selected int;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 공고를 고칠 수 있어요' using errcode = '42501';
  end if;

  select * into v_job from public.job_posts where id = p_job for update;
  if not found then
    raise exception '공고를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_job.owner_id is distinct from v_uid then
    raise exception '내 공고만 고칠 수 있어요' using errcode = '42501';
  end if;
  if not public.center_has_product(v_job.center_id, 'aquajob') then
    raise exception '공고를 고치려면 아쿠아잡 센터 구독이 필요해요' using errcode = '42501';
  end if;
  if not public.has_requirements(v_uid, 'post_' || v_job.job_type) then
    raise exception '이 종류의 공고에 필요한 서류가 확인된 상태가 아니에요' using errcode = '42501';
  end if;
  if public.job_effective_status(v_job) <> 'open' then
    raise exception '모집 중인 공고만 고칠 수 있어요' using errcode = '22023';
  end if;

  r := public.job_post_from_payload(payload, v_job.job_type);

  -- 선택한 지원 + 수락한 제안
  v_selected := public.job_filled_count(p_job);
  if r.headcount < v_selected then
    raise exception '이미 선택·수락한 인원(%명)보다 적게 줄일 수 없어요', v_selected using errcode = '22023';
  end if;

  update public.job_posts set
    title = r.title, region = r.region, venue = r.venue,
    class_date = r.class_date, start_time = r.start_time, end_time = r.end_time,
    work_days = r.work_days, work_time = r.work_time,
    tour_start = r.tour_start, tour_end = r.tour_end, destination = r.destination,
    destination_kind = r.destination_kind, covers_flight = r.covers_flight, covers_lodging = r.covers_lodging,
    pay_amount = r.pay_amount, pay_unit = r.pay_unit, headcount = r.headcount,
    requirement_tags = r.requirement_tags, description = r.description, deadline = r.deadline,
    edited_at = now()
  where id = p_job;

  if r.headcount = v_selected then
    perform public.close_job_with_reason(p_job, 'full');
  end if;
end;
$$;

revoke execute on function public.update_job_post(uuid, jsonb) from public, anon;
grant execute on function public.update_job_post(uuid, jsonb) to authenticated;

-- 지원자 선택 (007 정의 기준): 인원 = 선택 + 수락한 제안. 공고 행을 잠근 뒤 센다.
create or replace function public.select_applicant(p_app uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job_id uuid;
  v_job public.job_posts;
  v_app public.job_applications;
  v_selected int;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 선택할 수 있어요' using errcode = '42501';
  end if;

  select a.job_id into v_job_id from public.job_applications a where a.id = p_app;
  if not found then
    raise exception '지원 내역을 찾을 수 없어요' using errcode = 'P0002';
  end if;

  -- 잠금 순서: 공고 → 지원(지원 취소는 지원 행만 잠그므로 교착이 생기지 않는다)
  select * into v_job from public.job_posts where id = v_job_id for update;
  if v_job.owner_id is distinct from v_uid then
    raise exception '내 공고의 지원자만 선택할 수 있어요' using errcode = '42501';
  end if;
  if not public.center_has_product(v_job.center_id, 'aquajob') then
    raise exception '지원자를 선택하려면 아쿠아잡 센터 구독이 필요해요' using errcode = '42501';
  end if;

  select * into v_app from public.job_applications where id = p_app for update;
  if v_app.status is distinct from 'applied' then
    raise exception '지원함 상태의 지원자만 선택할 수 있어요' using errcode = '22023';
  end if;
  -- 정지·퇴출된 지원자는 선택할 수 없다(연락처가 열리면 안 된다)
  if not exists (
    select 1 from public.profiles ap where ap.id = v_app.instructor_id and ap.account_status = 'active'
  ) then
    raise exception '활성 상태가 아닌 지원자는 선택할 수 없어요' using errcode = '42501';
  end if;
  -- 숨김·마감·기한 지남은 여기서 거부. 인원(full)은 아래에서 잠금 안의 수로 직접 센다.
  if public.job_effective_status(v_job) not in ('open', 'full') then
    raise exception '모집이 끝난 공고예요' using errcode = '22023';
  end if;

  -- 선택한 지원 + 수락한 제안
  v_selected := public.job_filled_count(v_job_id);
  if v_selected >= v_job.headcount then
    raise exception '모집 인원이 다 찼어요' using errcode = '22023';
  end if;

  update public.job_applications set status = 'selected', decided_at = now() where id = p_app;

  if v_selected + 1 >= v_job.headcount then
    perform public.close_job_with_reason(v_job_id, 'full');
  end if;
end;
$$;

revoke execute on function public.select_applicant(uuid) from public, anon;
grant execute on function public.select_applicant(uuid) to authenticated;

-- 지원 (006 정의 기준) + 그 공고로 받은 제안이 보냄·수락 상태면 지원할 수 없다
-- (제안에 답하는 길로 — 한 사람이 인원을 두 번 차지하지 않게). 거절·철회·마감된 제안이면 지원할 수 있다.
create or replace function public.apply_to_job(p_job uuid, p_message text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.job_posts;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_app public.job_applications;
  v_id uuid;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 지원할 수 있어요' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and 'instructor' = any(p.roles)) then
    raise exception '강사 계정만 지원할 수 있어요' using errcode = '42501';
  end if;
  if not public.user_has_product(v_uid, 'aquajob_talent') then
    raise exception '지원하려면 아쿠아잡 강사 구독이 필요해요' using errcode = '42501';
  end if;
  if not public.can_view_job_detail(p_job) then
    raise exception '공고 상세를 볼 수 있어야 지원할 수 있어요' using errcode = '42501';
  end if;
  if v_msg is not null and char_length(v_msg) > 200 then
    raise exception '한마디는 200자까지 쓸 수 있어요' using errcode = '22023';
  end if;

  -- 선택·마감·제안과 겹치지 않게 공고 행을 잠근다(공유 잠금: 지원끼리는 서로 막지 않는다.
  -- send_offer·respond_offer는 FOR UPDATE라 지원과 순서대로 돈다)
  select j.* into v_job
  from public.job_posts j
  join public.profiles o on o.id = j.owner_id
  where j.id = p_job and o.account_status = 'active'
  for share of j;
  if not found or v_job.status = 'hidden' then
    raise exception '공고를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_job.owner_id = v_uid then
    raise exception '내 공고에는 지원할 수 없어요' using errcode = '42501';
  end if;
  if public.job_effective_status(v_job) <> 'open' then
    raise exception '모집이 끝난 공고예요' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.job_offers o
    where o.job_id = p_job and o.instructor_id = v_uid and o.status in ('offered', 'accepted')
  ) then
    raise exception '이 공고로 받은 제안이 있어요. 받은 제안에서 답해 주세요' using errcode = '22023';
  end if;

  select * into v_app from public.job_applications
  where job_id = p_job and instructor_id = v_uid
  for update;

  if found then
    if v_app.status <> 'withdrawn' then
      raise exception '이미 지원한 공고예요' using errcode = '23505';
    end if;
    update public.job_applications
      set status = 'applied', message = v_msg, decided_at = null
    where id = v_app.id;
    return v_app.id;
  end if;

  insert into public.job_applications (job_id, instructor_id, message)
  values (p_job, v_uid, v_msg)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.apply_to_job(uuid, text) from public, anon;
grant execute on function public.apply_to_job(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. 강사 정보 규칙 (008 정의 기준) + 내 공고의 제안을 수락한 강사
-- ---------------------------------------------------------------------
create or replace function public.job_can_view_talent(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_user = auth.uid()
    or public.is_admin()
    or (
      public.is_active()
      and public.job_center_entitled()
      and (
        -- 공개 이력서 강사
        exists (
          select 1 from public.talent_profiles tp
          where tp.user_id = p_user and tp.is_public
        )
        -- 내 공고에 지원한 강사(지원 취소 제외, 공개를 꺼도)
        or public.applied_to_my_jobs(p_user)
        -- 내 공고의 제안을 수락한 강사(공개를 꺼도)
        or exists (
          select 1
          from public.job_offers o
          join public.job_posts j on j.id = o.job_id
          where o.instructor_id = p_user and o.status = 'accepted' and j.owner_id = auth.uid()
        )
      )
    ),
    false
  );
$$;

revoke execute on function public.job_can_view_talent(uuid) from public, anon;
grant execute on function public.job_can_view_talent(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. 강사 둘러보기
-- ---------------------------------------------------------------------

-- 둘러보기·제안 대상: 활성 + 강사 역할 + 이력서 공개 + 온보딩 끝. 내부 전용(실행 권한 없음).
create or replace function public.job_talent_offerable(p_user uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.talent_profiles tp on tp.user_id = p.id
    where p.id = p_user
      and p.account_status = 'active'
      and 'instructor' = any(p.roles)
      and tp.is_public
      and tp.onboarding_done
  );
$$;

revoke execute on function public.job_talent_offerable(uuid) from public, anon, authenticated;

-- jsonb 배열 → text[] (배열이 아니면 빈 배열, 빈 글자 제외). 내부 전용.
create or replace function public.job_jsonb_text_array(p jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array(
    select btrim(x)
    from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
    where btrim(x) <> ''
  ), '{}');
$$;

revoke execute on function public.job_jsonb_text_array(jsonb) from public, anon, authenticated;

-- 강사 둘러보기: 활성 + 구독 센터(job_center_entitled())만. 이력서 공개 칸 + 유효한 서류 사실만
-- (연락처·MBTI·지난 센터·가르친 인원 같은 칸은 내보내지 않는다. 소개는 200자까지 잘라서).
-- 필터(p_filters, 모두 선택):
--   regions text[]        지역이 하나라도 겹치면
--   org text, level text  자격(certifications) 중 단체(와 등급)가 같은 것이 있으면(대소문자 무시)
--   scope text            활동 범위에 들어 있으면(pool | sea | overseas_tour)
--   available_days text[] 가능 요일이 하나라도 겹치면
--   verified_only boolean 강사 자격증 서류(instructor_cert)가 유효하면
create or replace function public.browse_instructors(
  p_filters jsonb default '{}'::jsonb,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  user_id uuid,
  display_name text,
  photo_path text,
  gender text,
  age_band text,
  regions text[],
  scopes text[],
  certifications jsonb,
  instructor_level text,
  instructor_years int,
  teaching_style_tags text[],
  intro text,
  available_days text[],
  desired_rate text,
  records jsonb,
  facts jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_regions text[];
  v_days text[];
  v_org text;
  v_level text;
  v_scope text;
  v_verified boolean;
begin
  if v_uid is null or not public.is_active() or not public.job_center_entitled() then
    raise exception '강사 둘러보기는 아쿠아잡 구독 중인 센터만 쓸 수 있어요' using errcode = '42501';
  end if;
  if jsonb_typeof(f) <> 'object' then
    raise exception '필터 형식이 올바르지 않아요' using errcode = '22023';
  end if;

  v_regions := public.job_jsonb_text_array(f -> 'regions');
  v_days := public.job_jsonb_text_array(f -> 'available_days');
  v_org := nullif(btrim(coalesce(f ->> 'org', '')), '');
  v_level := nullif(btrim(coalesce(f ->> 'level', '')), '');
  v_scope := nullif(btrim(coalesce(f ->> 'scope', '')), '');
  v_verified := coalesce((f ->> 'verified_only')::boolean, false);

  return query
  select
    p.id,
    p.display_name,
    tp.photo_path,
    tp.gender,
    tp.age_band,
    coalesce(tp.regions, '{}'),
    coalesce(tp.scopes, '{}'),
    coalesce((
      select jsonb_agg(jsonb_build_object('org', c ->> 'org', 'level', c ->> 'level'))
      from jsonb_array_elements(
        case when jsonb_typeof(tp.certifications) = 'array' then tp.certifications else '[]'::jsonb end
      ) c
    ), '[]'::jsonb),
    tp.instructor_level,
    tp.instructor_years,
    coalesce(tp.teaching_style_tags, '{}'),
    left(tp.intro, 200),
    coalesce(tp.available_days, '{}'),
    tp.desired_rate,
    coalesce(tp.records, '{}'::jsonb),
    -- 유효한 서류 사실(get_public_facts와 같은 칸, 파일 경로·번호·반려 사유 없음)
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'doc_type', e.doc_type,
        'valid_until', e.valid_until,
        'org', nullif(btrim(e.meta ->> 'org'), ''),
        'grade', nullif(btrim(e.meta ->> 'grade'), '')
      ) order by e.doc_type)
      from (
        select distinct d.doc_type
        from public.verification_documents d
        where d.owner_id = p.id and d.status = 'verified'
      ) t
      cross join lateral public.effective_doc(p.id, t.doc_type) e
      where e.id is not null
    ), '[]'::jsonb)
  from public.profiles p
  join public.talent_profiles tp on tp.user_id = p.id
  where p.id <> v_uid
    and p.account_status = 'active'
    and 'instructor' = any(p.roles)
    and tp.is_public
    and tp.onboarding_done
    and (cardinality(v_regions) = 0 or tp.regions && v_regions)
    and (cardinality(v_days) = 0 or tp.available_days && v_days)
    and (v_scope is null or v_scope = any(tp.scopes))
    and (
      (v_org is null and v_level is null)
      or exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(tp.certifications) = 'array' then tp.certifications else '[]'::jsonb end
        ) c
        where (v_org is null or lower(btrim(c ->> 'org')) = lower(v_org))
          and (v_level is null or lower(btrim(c ->> 'level')) = lower(v_level))
      )
    )
    and (not v_verified or (public.effective_doc(p.id, 'instructor_cert')).id is not null)
  order by tp.updated_at desc, p.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.browse_instructors(jsonb, int, int) from public, anon;
grant execute on function public.browse_instructors(jsonb, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 7. 제안 RPC
-- ---------------------------------------------------------------------

-- 제안 보내기: 공고 주인(활성 센터) + 센터 구독('aquajob') + 서류 요건('send_offer') + 공고 모집 중
-- + 강사가 둘러보기 대상(공개·활성·강사·온보딩 끝, 나 아님) + 그 공고에 지원하지 않음(취소 제외)
-- + 같은 공고·같은 강사 제안 처음 + 공고당 인원 × 5건 이내. 공고 행을 FOR UPDATE로 잠근 뒤 센다.
create or replace function public.send_offer(p_job uuid, p_instructor uuid, p_message text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.job_posts;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_count int;
  v_id uuid;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 제안할 수 있어요' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and 'center' = any(p.roles)) then
    raise exception '센터 계정만 제안할 수 있어요' using errcode = '42501';
  end if;
  if v_msg is not null and char_length(v_msg) > 200 then
    raise exception '한마디는 200자까지 쓸 수 있어요' using errcode = '22023';
  end if;

  select * into v_job from public.job_posts where id = p_job for update;
  if not found then
    raise exception '공고를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_job.owner_id is distinct from v_uid then
    raise exception '내 공고로만 제안할 수 있어요' using errcode = '42501';
  end if;
  if not public.center_has_product(v_job.center_id, 'aquajob') then
    raise exception '제안하려면 아쿠아잡 센터 구독이 필요해요' using errcode = '42501';
  end if;
  if not public.has_requirements(v_uid, 'send_offer') then
    raise exception '제안에 필요한 서류가 확인된 상태가 아니에요' using errcode = '42501';
  end if;
  if public.job_effective_status(v_job) <> 'open' then
    raise exception '모집 중인 공고로만 제안할 수 있어요' using errcode = '22023';
  end if;

  if p_instructor is null or p_instructor = v_uid or not public.job_talent_offerable(p_instructor) then
    raise exception '제안할 수 있는 강사가 아니에요' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.job_applications a
    where a.job_id = p_job and a.instructor_id = p_instructor and a.status <> 'withdrawn'
  ) then
    raise exception '이미 지원한 강사예요' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.job_offers o where o.job_id = p_job and o.instructor_id = p_instructor
  ) then
    raise exception '이 강사에게는 이 공고로 이미 제안했어요' using errcode = '23505';
  end if;

  select count(*) into v_count from public.job_offers o where o.job_id = p_job;
  if v_count >= v_job.headcount * 5 then
    raise exception '이 공고로 보낼 수 있는 제안(%건)을 다 보냈어요', v_job.headcount * 5 using errcode = '22023';
  end if;

  insert into public.job_offers (job_id, center_id, instructor_id, message)
  values (p_job, v_job.center_id, p_instructor, v_msg)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.send_offer(uuid, uuid, text) from public, anon;
grant execute on function public.send_offer(uuid, uuid, text) to authenticated;

-- 제안 철회: 보낸 센터(공고 주인, 활성)만, '보냄'일 때만. 구독 없이도 된다(close_job_post처럼 줄이는 쪽).
create or replace function public.withdraw_offer(p_offer uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.job_offers;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 제안을 철회할 수 있어요' using errcode = '42501';
  end if;

  select * into v_offer from public.job_offers where id = p_offer for update;
  if not found then
    raise exception '제안을 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.job_posts j where j.id = v_offer.job_id and j.owner_id = v_uid
  ) then
    raise exception '내가 보낸 제안만 철회할 수 있어요' using errcode = '42501';
  end if;
  if v_offer.status <> 'offered' then
    raise exception '답을 기다리는 제안만 철회할 수 있어요' using errcode = '22023';
  end if;

  update public.job_offers set status = 'withdrawn', responded_at = now() where id = p_offer;
end;
$$;

revoke execute on function public.withdraw_offer(uuid) from public, anon;
grant execute on function public.withdraw_offer(uuid) to authenticated;

-- 제안에 답하기: 받은 강사(활성)만, '보냄'일 때만.
--   거절: 언제나 된다(구독 없이도).
--   수락: 강사 역할 + 강사 구독('aquajob_talent') + 공고가 모집 중(공고 주인 활성, 숨김 아님).
--         공고 행을 FOR UPDATE로 잠근 뒤 (선택 + 수락한 제안) < 인원인지 센다. 인원이 차면 공고 마감(full)
--         — 남은 지원함 → 미선택, 남은 제안 → 마감. 수락하면 그 센터에만 연락처가 열린다(get_offer_contact).
create or replace function public.respond_offer(p_offer uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job_id uuid;
  v_instructor uuid;
  v_job public.job_posts;
  v_offer public.job_offers;
  v_filled int;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 제안에 답할 수 있어요' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception '수락 또는 거절을 골라 주세요' using errcode = '22023';
  end if;

  select o.job_id, o.instructor_id into v_job_id, v_instructor from public.job_offers o where o.id = p_offer;
  if not found then
    raise exception '제안을 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_instructor is distinct from v_uid then
    raise exception '내가 받은 제안에만 답할 수 있어요' using errcode = '42501';
  end if;

  if not p_accept then
    select * into v_offer from public.job_offers where id = p_offer for update;
    if v_offer.status <> 'offered' then
      raise exception '답을 기다리는 제안만 거절할 수 있어요' using errcode = '22023';
    end if;
    update public.job_offers set status = 'declined', responded_at = now() where id = p_offer;
    return;
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid and 'instructor' = any(p.roles)) then
    raise exception '강사 계정만 제안을 수락할 수 있어요' using errcode = '42501';
  end if;
  if not public.user_has_product(v_uid, 'aquajob_talent') then
    raise exception '제안을 수락하려면 아쿠아잡 강사 구독이 필요해요' using errcode = '42501';
  end if;

  -- 잠금 순서: 공고 → 제안(select_applicant·send_offer와 같다. 철회·거절은 제안 행만 잠근다)
  select j.* into v_job
  from public.job_posts j
  join public.profiles o on o.id = j.owner_id
  where j.id = v_job_id and o.account_status = 'active'
  for update of j;
  if not found or v_job.status = 'hidden' then
    raise exception '공고를 찾을 수 없어요' using errcode = 'P0002';
  end if;

  select * into v_offer from public.job_offers where id = p_offer for update;
  if v_offer.status <> 'offered' then
    raise exception '답을 기다리는 제안만 수락할 수 있어요' using errcode = '22023';
  end if;
  -- 숨김·마감·기한 지남은 여기서 거부. 인원(full)은 아래에서 잠금 안의 수로 직접 센다.
  if public.job_effective_status(v_job) not in ('open', 'full') then
    raise exception '모집이 끝난 공고예요' using errcode = '22023';
  end if;

  v_filled := public.job_filled_count(v_job_id);
  if v_filled >= v_job.headcount then
    raise exception '모집 인원이 다 찼어요' using errcode = '22023';
  end if;

  update public.job_offers set status = 'accepted', responded_at = now() where id = p_offer;

  if v_filled + 1 >= v_job.headcount then
    perform public.close_job_with_reason(v_job_id, 'full');
  end if;
end;
$$;

revoke execute on function public.respond_offer(uuid, boolean) from public, anon;
grant execute on function public.respond_offer(uuid, boolean) to authenticated;

-- 제안 수락한 강사 연락처 (get_applicant_contact(007)와 같은 확인):
-- 공고 주인(활성) + 그 센터가 구독 중('aquajob') + 제안이 '수락' + 강사 활성일 때만 1행. 그 외는 빈 결과.
create or replace function public.get_offer_contact(p_offer uuid)
returns table (phone text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select pc.phone, pc.email
  from public.job_offers o
  join public.job_posts j on j.id = o.job_id
  join public.private_contacts pc on pc.user_id = o.instructor_id
  join public.profiles ip on ip.id = o.instructor_id
  where o.id = p_offer
    and o.status = 'accepted'
    and ip.account_status = 'active'
    and auth.uid() is not null
    and j.owner_id = auth.uid()
    and public.is_active()
    and public.center_has_product(j.center_id, 'aquajob');
$$;

revoke execute on function public.get_offer_contact(uuid) from public, anon;
grant execute on function public.get_offer_contact(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. PostgREST 스키마 다시 읽기
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
