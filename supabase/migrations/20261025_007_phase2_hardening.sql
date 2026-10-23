-- =====================================================================
-- 아쿠아잡 007: 2단계 마무리 보안 보강 (최종 리뷰 반영)
-- 001 → 002 → 003 → 004 → 005 → 006을 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(drop policy if exists → create policy, create or replace —
-- 반환 칸이 그대로인 함수만 바꾼다).
-- 재정의한 함수는 모두 최신 정의(006 > 005)를 복사해 고쳤다:
--   update_job_post(005) · select_applicant(005) · get_applicant_contact(005)
--   · job_post_from_payload(005) · list_public_jobs(006) · get_job_summary(006)
--   · get_job_detail(006) · get_center_public_profile(006)
--
-- 1) 직접 REST 경로에도 활성 계정 관문
--    talent_profiles 조회: 센터 분기(공개 이력서)·지원자 분기는 is_active() + 센터 구독('aquajob')
--    job_applications 조회: 공고 주인 분기는 is_active() + 지원 취소(withdrawn) 행 제외
--      (지원한 강사 본인은 자기 취소 행을 계속 본다)
--    center_profiles 조회: 주인 + 관리자만. 남의 센터 정보는 SECURITY DEFINER RPC
--      (get_center_public_profile · get_job_detail · 요약 RPC)로만 나간다.
-- 2) 센터 구독('aquajob') 확인: update_job_post · select_applicant · get_applicant_contact ·
--    talent_profiles 센터 분기. close_job_post는 구독 없이도 된다(센터가 언제든 공고를 내릴 수 있게).
--    무료 기간(paid_mode=false)에는 center_has_product가 true라 지금 동작은 같다. 관리자는 영향 없음.
-- 3) update_job_post가 서류 요건(has_requirements 'post_'||종류)을 다시 확인한다.
-- 4) 공고 입력값 한도(job_post_from_payload): 마감일 ≤ 오늘(KST)+90일, 수업은 마감일 ≤ 수업일,
--    투어는 마감일 ≤ 투어 시작일. 지역은 job_region_options() 목록 안에서만
--    (lib/talent-profile/config.ts REGION_OPTIONS와 같아야 한다 — lib/jobs/regions.test.ts가 검사).
--    장소·근무 시간·행선지 100자, 자격 조건 하나 20자.
-- 5) 공고 주인 회원 id(owner_id)는 공고 주인·관리자에게만. 그 밖에는 null(center_id는 그대로).
--    같은 이유로 센터 공개 프로필의 user_id도 주인·관리자에게만 주고, 센터 서류 사실은
--    get_center_public_facts(centers.id)로 준다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 헬퍼
-- ---------------------------------------------------------------------

-- 공고 지역 목록(한 곳). TS 쪽 REGION_OPTIONS와 같아야 한다.
create or replace function public.job_region_options()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['서울', '경기', '인천', '강원', '충청', '전라', '경상', '부산', '제주', '해외']::text[];
$$;

revoke execute on function public.job_region_options() from public;
grant execute on function public.job_region_options() to anon, authenticated;

-- 호출자가 활성 센터이고 그 센터가 아쿠아잡 센터 구독('aquajob')을 가졌는가.
-- 정책 안에서 (select public.job_center_entitled())로 한 번만 계산한다.
create or replace function public.job_center_entitled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.center_has_product(c.id, 'aquajob')
    from public.centers c
    join public.profiles p on p.id = c.owner_user_id
    where c.owner_user_id = auth.uid()
      and 'center' = any(p.roles)
      and p.account_status = 'active'
  ), false);
$$;

revoke execute on function public.job_center_entitled() from public, anon;
grant execute on function public.job_center_entitled() to authenticated;

-- ---------------------------------------------------------------------
-- 1. 조회 정책
-- ---------------------------------------------------------------------

-- talent_profiles 조회 (005 정의 기준, 006에서 이름만 바뀜)
--   본인 · 관리자 · (활성 + 구독 센터) × (공개 이력서 또는 내 공고 지원자)
drop policy if exists talent_profiles_select on public.talent_profiles;
create policy talent_profiles_select on public.talent_profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (
      (select public.is_active())
      and (select public.job_center_entitled())
      and (
        (
          is_public
          and exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid()) and 'center' = any(p.roles)
          )
        )
        or public.applied_to_my_jobs(user_id)
      )
    )
  );

-- job_applications 조회 (005 정의 기준)
--   지원한 강사 본인(취소 포함) · 관리자 · 활성 공고 주인(취소 제외)
drop policy if exists job_applications_select on public.job_applications;
create policy job_applications_select on public.job_applications
  for select to authenticated
  using (
    instructor_id = (select auth.uid())
    or (select public.is_admin())
    or (
      (select public.is_active())
      and status <> 'withdrawn'
      and exists (
        select 1 from public.job_posts j
        where j.id = job_applications.job_id and j.owner_id = (select auth.uid())
      )
    )
  );

-- center_profiles 조회 (001의 "로그인 사용자 모두"를 대체): 주인 + 관리자만
drop policy if exists center_profiles_select_authenticated on public.center_profiles;
drop policy if exists center_profiles_select_own_or_admin on public.center_profiles;
create policy center_profiles_select_own_or_admin on public.center_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- 2. 공고 입력값 검사 (005 정의 기준 + 한도)
-- ---------------------------------------------------------------------

create or replace function public.job_post_from_payload(p jsonb, p_type text)
returns public.job_posts
language plpgsql
stable
set search_path = public
as $$
declare
  r public.job_posts;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception '공고 내용이 비어 있어요' using errcode = '22023';
  end if;
  if p_type is null or p_type not in ('lesson', 'affiliation', 'tour') then
    raise exception '공고 종류가 올바르지 않아요' using errcode = '22023';
  end if;

  r.job_type := p_type;

  r.title := nullif(btrim(coalesce(p ->> 'title', '')), '');
  if r.title is null or char_length(r.title) not between 2 and 60 then
    raise exception '제목은 2~60자로 써 주세요' using errcode = '22023';
  end if;

  r.region := nullif(btrim(coalesce(p ->> 'region', '')), '');
  if r.region is null then
    raise exception '지역을 골라 주세요' using errcode = '22023';
  end if;
  if not (r.region = any(public.job_region_options())) then
    raise exception '지역은 목록에서 골라 주세요' using errcode = '22023';
  end if;

  r.venue := nullif(btrim(coalesce(p ->> 'venue', '')), '');
  if r.venue is not null and char_length(r.venue) > 100 then
    raise exception '장소는 100자까지 쓸 수 있어요' using errcode = '22023';
  end if;

  r.description := nullif(btrim(coalesce(p ->> 'description', '')), '');
  if r.description is null then
    raise exception '상세 설명을 써 주세요' using errcode = '22023';
  end if;
  if char_length(r.description) > 3000 then
    raise exception '상세 설명은 3000자까지 쓸 수 있어요' using errcode = '22023';
  end if;

  r.headcount := (p ->> 'headcount')::int;
  if r.headcount is null or r.headcount not between 1 and 20 then
    raise exception '모집 인원은 1~20명이에요' using errcode = '22023';
  end if;

  r.deadline := (p ->> 'deadline')::date;
  if r.deadline is null then
    raise exception '마감일을 골라 주세요' using errcode = '22023';
  end if;
  if r.deadline < v_today then
    raise exception '마감일은 오늘 이후여야 해요' using errcode = '22023';
  end if;
  if r.deadline > v_today + 90 then
    raise exception '마감일은 오늘부터 90일 안으로 골라 주세요' using errcode = '22023';
  end if;

  r.pay_amount := (p ->> 'pay_amount')::int;
  r.pay_unit := nullif(btrim(coalesce(p ->> 'pay_unit', '')), '');
  if (r.pay_amount is null) <> (r.pay_unit is null) then
    raise exception '단가는 금액과 단위를 함께 써 주세요(비우면 협의)' using errcode = '22023';
  end if;
  if r.pay_amount is not null and r.pay_amount <= 0 then
    raise exception '단가는 0보다 커야 해요' using errcode = '22023';
  end if;
  if r.pay_unit is not null and r.pay_unit not in ('per_class', 'per_hour', 'per_day', 'per_month', 'total') then
    raise exception '단가 단위가 올바르지 않아요' using errcode = '22023';
  end if;

  r.requirement_tags := coalesce(array(
    select btrim(x)
    from jsonb_array_elements_text(
      case when jsonb_typeof(p -> 'requirement_tags') = 'array' then p -> 'requirement_tags' else '[]'::jsonb end
    ) x
    where btrim(x) <> ''
  ), '{}');
  if cardinality(r.requirement_tags) > 10 then
    raise exception '자격 조건은 10개까지 고를 수 있어요' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(r.requirement_tags) t where char_length(t) > 20) then
    raise exception '자격 조건은 하나에 20자까지 쓸 수 있어요' using errcode = '22023';
  end if;

  if p_type = 'lesson' then
    r.class_date := (p ->> 'class_date')::date;
    if r.class_date is null then
      raise exception '수업 날짜를 골라 주세요' using errcode = '22023';
    end if;
    if r.class_date < v_today then
      raise exception '수업 날짜는 오늘 이후여야 해요' using errcode = '22023';
    end if;
    if r.deadline > r.class_date then
      raise exception '마감일은 수업 날짜와 같거나 그 전이어야 해요' using errcode = '22023';
    end if;
    r.start_time := nullif(p ->> 'start_time', '')::time;
    r.end_time := nullif(p ->> 'end_time', '')::time;
    if r.start_time is not null and r.end_time is not null and r.end_time <= r.start_time then
      raise exception '끝나는 시간은 시작 시간보다 늦어야 해요' using errcode = '22023';
    end if;
  elsif p_type = 'affiliation' then
    r.work_days := coalesce(array(
      select btrim(x)
      from jsonb_array_elements_text(
        case when jsonb_typeof(p -> 'work_days') = 'array' then p -> 'work_days' else '[]'::jsonb end
      ) x
      where btrim(x) <> ''
    ), '{}');
    if not (r.work_days <@ array['월', '화', '수', '목', '금', '토', '일']::text[]) then
      raise exception '근무 요일은 월~일 중에서 골라 주세요' using errcode = '22023';
    end if;
    r.work_time := nullif(btrim(coalesce(p ->> 'work_time', '')), '');
    if r.work_time is not null and char_length(r.work_time) > 100 then
      raise exception '근무 시간은 100자까지 쓸 수 있어요' using errcode = '22023';
    end if;
  else -- tour
    r.tour_start := (p ->> 'tour_start')::date;
    r.tour_end := (p ->> 'tour_end')::date;
    if r.tour_start is null or r.tour_end is null then
      raise exception '투어 기간을 골라 주세요' using errcode = '22023';
    end if;
    if r.tour_start < v_today then
      raise exception '투어 시작일은 오늘 이후여야 해요' using errcode = '22023';
    end if;
    if r.tour_end < r.tour_start then
      raise exception '투어 종료일은 시작일 이후여야 해요' using errcode = '22023';
    end if;
    if r.deadline > r.tour_start then
      raise exception '마감일은 투어 시작일과 같거나 그 전이어야 해요' using errcode = '22023';
    end if;
    r.destination := nullif(btrim(coalesce(p ->> 'destination', '')), '');
    if r.destination is null then
      raise exception '행선지를 써 주세요' using errcode = '22023';
    end if;
    if char_length(r.destination) > 100 then
      raise exception '행선지는 100자까지 쓸 수 있어요' using errcode = '22023';
    end if;
    r.destination_kind := nullif(btrim(coalesce(p ->> 'destination_kind', '')), '');
    if r.destination_kind is not null and r.destination_kind not in ('domestic', 'overseas') then
      raise exception '행선지 구분이 올바르지 않아요' using errcode = '22023';
    end if;
    r.covers_flight := coalesce((p ->> 'covers_flight')::boolean, false);
    r.covers_lodging := coalesce((p ->> 'covers_lodging')::boolean, false);
  end if;

  return r;
end;
$$;

revoke execute on function public.job_post_from_payload(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 쓰기·연락처 RPC: 센터 구독 + 서류 요건
-- ---------------------------------------------------------------------

-- 공고 수정 (005 정의 기준): 주인만, 모집 중일 때만. 종류는 바꿀 수 없다(payload의 job_type은 무시).
-- + 센터 구독('aquajob') + 서류 요건('post_'||종류)을 다시 확인한다.
-- 등록일(created_at)은 그대로, edited_at = now(). 인원은 이미 선택한 수보다 적게 못 줄인다.
-- 인원을 선택 수와 같게 줄이면 그 자리에서 인원 마감(closed/full)한다.
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

  select count(*) into v_selected
  from public.job_applications a where a.job_id = p_job and a.status = 'selected';
  if r.headcount < v_selected then
    raise exception '이미 선택한 인원(%명)보다 적게 줄일 수 없어요', v_selected using errcode = '22023';
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

-- 지원자 선택 (005 정의 기준): 공고 주인(활성)만 + 센터 구독('aquajob').
-- 공고 행을 FOR UPDATE로 잠근 뒤 선택 수를 세서 인원을 지킨다.
-- 선택하면 그 센터에만 연락처가 열린다(get_applicant_contact). 되돌리기 없음.
-- 인원이 차면 공고를 closed/full로, 남은 '지원함'은 '미선택'으로.
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
  -- 숨김·마감·기한 지남은 여기서 거부. 인원(full)은 아래에서 잠금 안의 선택 수로 직접 센다.
  if public.job_effective_status(v_job) not in ('open', 'full') then
    raise exception '모집이 끝난 공고예요' using errcode = '22023';
  end if;

  select count(*) into v_selected
  from public.job_applications a where a.job_id = v_job_id and a.status = 'selected';
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

-- 지원자 연락처 (005 정의 기준): 공고 주인(활성)이고 그 센터가 구독 중이고('aquajob')
-- 그 지원이 '선택됨'이고 지원자도 활성일 때만 1행. 그 외는 빈 결과.
create or replace function public.get_applicant_contact(p_app uuid)
returns table (phone text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select pc.phone, pc.email
  from public.job_applications a
  join public.job_posts j on j.id = a.job_id
  join public.private_contacts pc on pc.user_id = a.instructor_id
  join public.profiles ap on ap.id = a.instructor_id
  where a.id = p_app
    and a.status = 'selected'
    and ap.account_status = 'active'
    and auth.uid() is not null
    and j.owner_id = auth.uid()
    and public.is_active()
    and public.center_has_product(j.center_id, 'aquajob');
$$;

revoke execute on function public.get_applicant_contact(uuid) from public, anon;
grant execute on function public.get_applicant_contact(uuid) to authenticated;

-- close_job_post(005)는 그대로 둔다: 구독이 없어도 주인(활성)은 공고를 마감할 수 있다.

-- ---------------------------------------------------------------------
-- 4. 공개 RPC: owner_id는 공고 주인·관리자에게만 (반환 칸은 006과 같다)
--    job_summary_rows는 내부 전용(실행 권한 없음)이라 그대로 owner_id를 갖고, 바깥 RPC가 가린다.
--    list_center_job_history(006)는 owner_id를 내보내지 않으므로 그대로 둔다.
-- ---------------------------------------------------------------------

-- 공고 목록 (006 정의 기준 + owner_id 가림)
create or replace function public.list_public_jobs(
  p_type text default null,
  p_region text default null,
  p_paid_only boolean default false,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid, owner_id uuid, center_id uuid, center_name text, job_type text, title text, region text, venue text,
  class_date date, start_time time, end_time time, work_days text[], work_time text,
  tour_start date, tour_end date, destination text, destination_kind text,
  covers_flight boolean, covers_lodging boolean, pay_amount int, pay_unit text,
  headcount int, remaining int, requirement_tags text[], deadline date, view_count int,
  created_at timestamptz, edited_at timestamptz, effective_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    case when s.owner_id = auth.uid() or (select public.is_admin()) then s.owner_id end,
    s.center_id, s.center_name, s.job_type, s.title, s.region, s.venue,
    s.class_date, s.start_time, s.end_time, s.work_days, s.work_time,
    s.tour_start, s.tour_end, s.destination, s.destination_kind,
    s.covers_flight, s.covers_lodging, s.pay_amount, s.pay_unit,
    s.headcount, s.remaining, s.requirement_tags, s.deadline, s.view_count,
    s.created_at, s.edited_at, s.effective_status
  from public.job_summary_rows(null, null, true) s
  where (p_type is null or s.job_type = p_type)
    and (p_region is null or s.region = p_region)
    and (not coalesce(p_paid_only, false) or s.pay_amount is not null)
  order by (s.effective_status = 'open') desc, s.created_at desc, s.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.list_public_jobs(text, text, boolean, int, int) from public;
grant execute on function public.list_public_jobs(text, text, boolean, int, int) to anon, authenticated;

-- 공고 요약 1건 (006 정의 기준 + owner_id 가림)
create or replace function public.get_job_summary(p_job uuid)
returns table (
  id uuid, owner_id uuid, center_id uuid, center_name text, job_type text, title text, region text, venue text,
  class_date date, start_time time, end_time time, work_days text[], work_time text,
  tour_start date, tour_end date, destination text, destination_kind text,
  covers_flight boolean, covers_lodging boolean, pay_amount int, pay_unit text,
  headcount int, remaining int, requirement_tags text[], deadline date, view_count int,
  created_at timestamptz, edited_at timestamptz, effective_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    case when s.owner_id = auth.uid() or (select public.is_admin()) then s.owner_id end,
    s.center_id, s.center_name, s.job_type, s.title, s.region, s.venue,
    s.class_date, s.start_time, s.end_time, s.work_days, s.work_time,
    s.tour_start, s.tour_end, s.destination, s.destination_kind,
    s.covers_flight, s.covers_lodging, s.pay_amount, s.pay_unit,
    s.headcount, s.remaining, s.requirement_tags, s.deadline, s.view_count,
    s.created_at, s.edited_at, s.effective_status
  from public.job_summary_rows(p_job, null, true) s
  where p_job is not null;
$$;

revoke execute on function public.get_job_summary(uuid) from public;
grant execute on function public.get_job_summary(uuid) to anon, authenticated;

-- 공고 상세 (006 정의 기준 + owner_id 가림). 로그인 + can_view_job_detail 필요.
create or replace function public.get_job_detail(p_job uuid)
returns table (
  id uuid, owner_id uuid, center_id uuid, center_name text, job_type text, title text, region text, venue text,
  class_date date, start_time time, end_time time, work_days text[], work_time text,
  tour_start date, tour_end date, destination text, destination_kind text,
  covers_flight boolean, covers_lodging boolean, pay_amount int, pay_unit text,
  headcount int, remaining int, requirement_tags text[], deadline date, view_count int,
  created_at timestamptz, edited_at timestamptz, effective_status text,
  description text,
  center jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = '42501';
  end if;
  if not public.can_view_job_detail(p_job) then
    raise exception '상세 내용을 볼 수 없어요' using errcode = '42501';
  end if;

  -- 관리자·공고 주인이면 숨김 공고도 보고 owner_id도 받는다
  v_public := not (
    public.is_admin()
    or exists (select 1 from public.job_posts x where x.id = p_job and x.owner_id = v_uid)
  );

  return query
  select
    s.id,
    case when not v_public then s.owner_id end,
    s.center_id, s.center_name, s.job_type, s.title, s.region, s.venue,
    s.class_date, s.start_time, s.end_time, s.work_days, s.work_time,
    s.tour_start, s.tour_end, s.destination, s.destination_kind,
    s.covers_flight, s.covers_lodging, s.pay_amount, s.pay_unit,
    s.headcount, s.remaining, s.requirement_tags, s.deadline, s.view_count,
    s.created_at, s.edited_at, s.effective_status,
    j.description,
    jsonb_build_object(
      'center_name', s.center_name,
      'representative_name', cp.representative_name,
      'head_instructor', cp.head_instructor,
      'instructor_count', cp.instructor_count,
      'instructor_names', coalesce(cp.instructor_names, '{}'),
      'monthly_students', cp.monthly_students,
      'teaching_days', coalesce(cp.teaching_days, '{}'),
      'teaching_time', cp.teaching_time,
      'venues', coalesce(cp.venues, '{}'),
      'address', cp.address,
      'photo_paths', coalesce(cp.photo_paths, '{}')
    )
  from public.job_summary_rows(p_job, null, v_public) s
  join public.job_posts j on j.id = s.id
  left join public.center_profiles cp on cp.user_id = j.owner_id
  where p_job is not null;
end;
$$;

revoke execute on function public.get_job_detail(uuid) from public, anon;
grant execute on function public.get_job_detail(uuid) to authenticated;

-- 센터 공개 프로필 (006 정의 기준). user_id(주인 회원 id)는 주인·관리자에게만.
-- 센터명·주 교육 장소·교육 요일·시간대·사진은 누구나.
-- 대표자·대표강사·소속강사·월 교육생·주소는 로그인 + (센터 주인 본인 또는 can_view_job_detail())일 때만.
create or replace function public.get_center_public_profile(p_center_id uuid)
returns table (
  center_id uuid,
  user_id uuid,
  center_name text,
  venues text[],
  teaching_days text[],
  teaching_time text,
  photo_paths text[],
  detail_visible boolean,
  representative_name text,
  head_instructor text,
  instructor_count int,
  instructor_names text[],
  monthly_students int,
  address text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    case when v.mine then p.id end,
    coalesce(nullif(btrim(cp.center_name), ''), p.display_name),
    coalesce(cp.venues, '{}'),
    coalesce(cp.teaching_days, '{}'),
    cp.teaching_time,
    coalesce(cp.photo_paths, '{}'),
    v.ok,
    case when v.ok then cp.representative_name end,
    case when v.ok then cp.head_instructor end,
    case when v.ok then cp.instructor_count end,
    case when v.ok then cp.instructor_names end,
    case when v.ok then cp.monthly_students end,
    case when v.ok then cp.address end
  from public.centers c
  join public.profiles p on p.id = c.owner_user_id
  left join public.center_profiles cp on cp.user_id = p.id
  cross join lateral (
    select
      (auth.uid() is not null and (c.owner_user_id = auth.uid() or public.can_view_job_detail())) as ok,
      (auth.uid() is not null and (c.owner_user_id = auth.uid() or public.is_admin())) as mine
  ) v
  where c.id = p_center_id
    and 'center' = any(p.roles)
    and (p.account_status = 'active' or p.id = auth.uid() or public.is_admin());
$$;

revoke execute on function public.get_center_public_profile(uuid) from public;
grant execute on function public.get_center_public_profile(uuid) to anon, authenticated;

-- 센터 서류 사실 (새로): centers.id로 찾는다. 센터 서류 종류만, 규칙은 get_public_facts(006)와 같다
-- (정지·퇴출 센터는 숨김, 파일 경로·번호는 없음). 센터 공개 페이지가 주인 회원 id 없이 쓴다.
create or replace function public.get_center_public_facts(p_center_id uuid)
returns table (doc_type text, valid_until date, verified_at timestamptz, org text, grade text)
language sql
stable
security definer
set search_path = public
as $$
  select f.doc_type, f.valid_until, f.verified_at, f.org, f.grade
  from public.centers c
  join public.profiles p on p.id = c.owner_user_id
  cross join lateral public.get_public_facts(c.owner_user_id) f
  where c.id = p_center_id
    and 'center' = any(p.roles)
    and f.doc_type in ('business_registration', 'travel_business', 'representative_id', 'rep_instructor_cert')
  order by f.doc_type;
$$;

revoke execute on function public.get_center_public_facts(uuid) from public;
grant execute on function public.get_center_public_facts(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. PostgREST 스키마 다시 읽기
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
