-- =====================================================================
-- 아쿠아잡 2단계: 공고 · 지원 · 선택 · 조회수
-- 001 → 002 → 003 → 004를 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(if not exists, on conflict do nothing,
-- create or replace, drop policy if exists → create policy).
--
-- 보안 핵심
-- 1) 연락처는 "공고 주인 + 그 공고에서 선택한 지원자"일 때만 get_applicant_contact로 열린다.
--    그 밖의 어떤 RPC·정책도 private_contacts를 돌려주지 않는다(001 정책 그대로: 본인·관리자).
-- 2) 모집 인원은 select_applicant가 공고 행을 FOR UPDATE로 잠근 뒤 선택 수를 세서 지킨다.
-- 3) 공고 등록은 requirement_rules(post_lesson / post_affiliation / post_tour)의 서류가
--    유효(effective_doc)해야 한다(has_requirements). 규칙은 표 한 곳에서만 본다.
-- 4) 공고·지원 테이블은 직접 쓰기가 막혀 있고(쓰기 정책 없음), 모든 쓰기는 RPC로만 한다.
--    쓰기 RPC는 전부 is_active()를 확인한다.
-- 5) 공개(로그인 전) 화면은 요약 RPC(list_public_jobs, get_job_summary)만 쓴다.
--    상세 설명·센터 상세는 get_job_detail(로그인 + can_view_job_detail)로만.
-- 6) 날짜는 전부 KST: (now() at time zone 'Asia/Seoul')::date
--
-- 공고 상태(job_effective_status) — TS lib/jobs의 jobDisplayStatus와 같은 규칙이어야 한다.
--   hidden > closed(저장된 마감: 사유 full → 'full', expired → 'expired', manual → 'closed')
--   > expired(오늘 KST > 마감일, 또는 수업일·투어 시작일이 오늘보다 앞) > full(선택 수 ≥ 인원) > open
--   마감일 당일은 모집 중이고, 다음 날 0시(KST)부터 expired다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 앱 설정: paid_mode(유료 전환 스위치). 누구나 읽고, 관리자만 바꾼다.
-- ---------------------------------------------------------------------

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null
);

insert into public.app_settings (key, value) values ('paid_mode', 'false'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select_all on public.app_settings;
create policy app_settings_select_all on public.app_settings
  for select to anon, authenticated using (true);

drop policy if exists app_settings_insert_admin on public.app_settings;
create policy app_settings_insert_admin on public.app_settings
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin on public.app_settings
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists app_settings_delete_admin on public.app_settings;
create policy app_settings_delete_admin on public.app_settings
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 2. 테이블
-- ---------------------------------------------------------------------

create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade, -- 센터 계정
  center_id uuid null, -- 핀프렌즈 대비, 지금은 null
  job_type text not null check (job_type in ('lesson', 'affiliation', 'tour')),
  title text not null check (char_length(title) between 2 and 60),
  region text not null,
  venue text,
  -- 수업 단위
  class_date date,
  start_time time,
  end_time time,
  -- 소속 계약
  work_days text[],
  work_time text,
  -- 투어 동행
  tour_start date,
  tour_end date,
  destination text,
  destination_kind text check (destination_kind in ('domestic', 'overseas')),
  covers_flight boolean,
  covers_lodging boolean,
  -- 단가: 둘 다 null이면 "협의"
  pay_amount int null check (pay_amount > 0),
  pay_unit text null check (pay_unit in ('per_class', 'per_hour', 'per_day', 'per_month', 'total')),
  headcount int not null check (headcount between 1 and 20),
  requirement_tags text[] not null default '{}',
  description text not null,
  deadline date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'hidden')),
  closed_reason text null check (closed_reason in ('manual', 'full', 'expired')),
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz null,
  constraint job_posts_pay_pair check ((pay_amount is null) = (pay_unit is null)),
  constraint job_posts_closed_has_reason check (status <> 'closed' or closed_reason is not null),
  constraint job_posts_lesson_fields check (job_type <> 'lesson' or class_date is not null),
  constraint job_posts_tour_fields check (
    job_type <> 'tour'
    or (tour_start is not null and tour_end is not null and destination is not null and tour_end >= tour_start)
  )
);

create index if not exists job_posts_owner_idx on public.job_posts (owner_id, created_at desc);
create index if not exists job_posts_status_created_idx on public.job_posts (status, created_at desc);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_posts(id) on delete cascade,
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  message text check (message is null or char_length(message) <= 200),
  status text not null default 'applied'
    check (status in ('applied', 'selected', 'withdrawn', 'not_selected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz null,
  unique (job_id, instructor_id)
);

create index if not exists job_applications_instructor_idx
  on public.job_applications (instructor_id, created_at desc);
create index if not exists job_applications_job_status_idx
  on public.job_applications (job_id, status);

-- 조회 기록: 같은 사람(로그인 id) 또는 같은 기기('d:'||기기 키)는 KST 하루 1회. RPC로만 쓴다.
create table if not exists public.job_views (
  job_id uuid not null references public.job_posts(id) on delete cascade,
  viewer_key text not null,
  view_day date not null,
  primary key (job_id, viewer_key, view_day)
);

-- ---------------------------------------------------------------------
-- 3. 공고 상태 · 상세 열람 헬퍼
-- ---------------------------------------------------------------------

-- SECURITY INVOKER: 직접 부르면 job_applications RLS가 그대로 적용된다(주인·관리자만 정확한 선택 수).
-- 아래 SECURITY DEFINER RPC 안에서는 소유자 권한으로 돈다.
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
    when (
      select count(*) from public.job_applications a
      where a.job_id = j.id and a.status = 'selected'
    ) >= j.headcount then 'full'
    else 'open'
  end;
$$;

revoke execute on function public.job_effective_status(public.job_posts) from public, anon;
grant execute on function public.job_effective_status(public.job_posts) to authenticated;

create or replace function public.paid_mode()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.value = 'true'::jsonb from public.app_settings s where s.key = 'paid_mode'), false);
$$;

revoke execute on function public.paid_mode() from public, anon;
grant execute on function public.paid_mode() to authenticated;

-- 공고 상세(설명·센터 상세)를 볼 수 있는가.
-- 로그인 + 활성. 무료 기간(paid_mode=false)이면 모두 true.
-- 유료 전환 후(구독 테이블은 3단계)는 자리만: 관리자와 그 공고의 주인만 true.
create or replace function public.can_view_job_detail(p_job uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and public.is_active()
    and (
      not public.paid_mode()
      or public.is_admin()
      or exists (select 1 from public.job_posts j where j.id = p_job and j.owner_id = auth.uid())
    ),
    false
  );
$$;

revoke execute on function public.can_view_job_detail(uuid) from public, anon;
grant execute on function public.can_view_job_detail(uuid) to authenticated;

-- 대상 강사가 "보는 사람(활성 센터)의 공고"에 지원했는가. 지원 상태와 관계없이(취소 포함) 참.
-- SECURITY DEFINER라 정책 안에서 불러도 job_applications·job_posts RLS를 다시 돌지 않는다.
create or replace function public.applied_to_my_jobs(p_instructor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_active()
    and exists (
      select 1 from public.profiles v
      where v.id = auth.uid() and 'center' = any(v.roles)
    )
    and exists (
      select 1
      from public.job_applications a
      join public.job_posts j on j.id = a.job_id
      where a.instructor_id = p_instructor and j.owner_id = auth.uid()
    ),
    false
  );
$$;

revoke execute on function public.applied_to_my_jobs(uuid) from public, anon;
grant execute on function public.applied_to_my_jobs(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. can_view_profile 재정의 (004 정의 기준)
--    + 본인·관리자가 아닌 조건은 보는 사람이 활성 상태여야 한다
--    + 보는 사람(활성 센터)의 공고에 지원한 강사
-- ---------------------------------------------------------------------

create or replace function public.can_view_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    target = auth.uid()
    or public.is_admin()
    or (
      public.is_active()
      and (
        -- 센터 이름은 로그인한 모두에게
        exists (
          select 1 from public.profiles t
          where t.id = target and 'center' = any(t.roles)
        )
        -- 센터는 공개 프로필 강사의 이름을 본다(instructor_profiles 조회 정책과 같은 조건)
        or (
          exists (
            select 1 from public.profiles v
            where v.id = auth.uid() and 'center' = any(v.roles)
          )
          and exists (
            select 1 from public.instructor_profiles ip
            where ip.user_id = target and ip.is_public
          )
        )
        -- 센터는 자기 공고에 지원한 강사의 이름을 본다(공개를 꺼도)
        or public.applied_to_my_jobs(target)
      )
    ),
    false
  );
$$;

revoke execute on function public.can_view_profile(uuid) from public, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;

-- instructor_profiles 조회 (003 정의 기준) + 자기 공고에 지원한 강사의 이력서(공개를 꺼도)
drop policy if exists instructor_profiles_select on public.instructor_profiles;
create policy instructor_profiles_select on public.instructor_profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (
      is_public
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and 'center' = any(p.roles)
      )
    )
    or public.applied_to_my_jobs(user_id)
  );

-- ---------------------------------------------------------------------
-- 5. RLS: 공고·지원은 조회만(주인·본인·관리자), 쓰기는 RPC로만. 조회 기록은 직접 접근 불가.
-- ---------------------------------------------------------------------

alter table public.job_posts enable row level security;
alter table public.job_applications enable row level security;
alter table public.job_views enable row level security;

drop policy if exists job_posts_select_owner_or_admin on public.job_posts;
create policy job_posts_select_owner_or_admin on public.job_posts
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists job_applications_select on public.job_applications;
create policy job_applications_select on public.job_applications
  for select to authenticated
  using (
    instructor_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1 from public.job_posts j
      where j.id = job_applications.job_id and j.owner_id = (select auth.uid())
    )
  );

-- job_views: 정책 없음(RLS로 전부 거부) + 권한도 뺀다
revoke all on table public.job_views from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. 내부 헬퍼 (외부 실행 불가)
-- ---------------------------------------------------------------------

-- 요약 행: 공개 RPC들이 같은 칸을 내보내도록 한 곳에서 만든다. 상세 설명·센터 상세는 없다.
-- p_public = true면 숨김 공고와 활성이 아닌(정지·퇴출) 센터의 공고를 뺀다.
create or replace function public.job_summary_rows(p_job uuid, p_owner uuid, p_public boolean)
returns table (
  id uuid,
  owner_id uuid,
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
    j.id, j.owner_id,
    coalesce(nullif(btrim(cp.center_name), ''), p.display_name),
    j.job_type, j.title, j.region, j.venue,
    j.class_date, j.start_time, j.end_time,
    j.work_days, j.work_time,
    j.tour_start, j.tour_end, j.destination, j.destination_kind, j.covers_flight, j.covers_lodging,
    j.pay_amount, j.pay_unit, j.headcount,
    greatest(j.headcount - (
      select count(*) from public.job_applications a
      where a.job_id = j.id and a.status = 'selected'
    )::int, 0),
    j.requirement_tags, j.deadline, j.view_count, j.created_at, j.edited_at,
    public.job_effective_status(j)
  from public.job_posts j
  join public.profiles p on p.id = j.owner_id
  left join public.center_profiles cp on cp.user_id = j.owner_id
  where (p_job is null or j.id = p_job)
    and (p_owner is null or j.owner_id = p_owner)
    and (not p_public or (j.status <> 'hidden' and p.account_status = 'active'));
$$;

revoke execute on function public.job_summary_rows(uuid, uuid, boolean) from public, anon, authenticated;

-- 공고 입력값 검사 → 검사된 job_posts 행(id·owner·상태 칸은 비어 있음). create/update가 같이 쓴다.
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

  r.venue := nullif(btrim(coalesce(p ->> 'venue', '')), '');

  r.description := nullif(btrim(coalesce(p ->> 'description', '')), '');
  if r.description is null then
    raise exception '상세 설명을 써 주세요' using errcode = '22023';
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

  if p_type = 'lesson' then
    r.class_date := (p ->> 'class_date')::date;
    if r.class_date is null then
      raise exception '수업 날짜를 골라 주세요' using errcode = '22023';
    end if;
    if r.class_date < v_today then
      raise exception '수업 날짜는 오늘 이후여야 해요' using errcode = '22023';
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
    r.work_time := nullif(btrim(coalesce(p ->> 'work_time', '')), '');
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
    r.destination := nullif(btrim(coalesce(p ->> 'destination', '')), '');
    if r.destination is null then
      raise exception '행선지를 써 주세요' using errcode = '22023';
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

-- 공고를 마감하고 남은 '지원함'을 '미선택'으로 바꾼다(호출하는 쪽이 공고 행을 잠근 뒤 부른다)
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
$$;

revoke execute on function public.close_job_with_reason(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. 공개 읽기 RPC (anon 포함)
-- ---------------------------------------------------------------------

-- 공고 목록(요약만). p_type·p_region이 null이면 전체. p_paid_only면 단가 공개 공고만.
-- 모집 중인 공고가 먼저, 그 안에서는 최신 등록순.
create or replace function public.list_public_jobs(
  p_type text default null,
  p_region text default null,
  p_paid_only boolean default false,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid, owner_id uuid, center_name text, job_type text, title text, region text, venue text,
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
  select s.*
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

-- 공고 요약 1건(공개 주소·공유 링크용). 숨김·정지 센터 공고는 없음.
create or replace function public.get_job_summary(p_job uuid)
returns table (
  id uuid, owner_id uuid, center_name text, job_type text, title text, region text, venue text,
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
  select s.* from public.job_summary_rows(p_job, null, true) s where p_job is not null;
$$;

revoke execute on function public.get_job_summary(uuid) from public;
grant execute on function public.get_job_summary(uuid) to anon, authenticated;

-- 조회수: 로그인했으면 사용자 id, 아니면 'd:'||기기 키로 KST 하루 1회. 공고 주인은 세지 않는다.
create or replace function public.record_job_view(p_job uuid, p_device_key text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_owner uuid;
  v_n int;
begin
  if v_uid is not null then
    v_key := v_uid::text;
  else
    if p_device_key is null or p_device_key !~ '^[A-Za-z0-9_-]{16,64}$' then
      raise exception '기기 키가 올바르지 않아요' using errcode = '22023';
    end if;
    v_key := 'd:' || p_device_key;
  end if;

  select j.owner_id into v_owner
  from public.job_posts j
  join public.profiles p on p.id = j.owner_id
  where j.id = p_job and j.status <> 'hidden' and p.account_status = 'active';
  if not found or v_owner = v_uid then
    return;
  end if;

  insert into public.job_views (job_id, viewer_key, view_day)
  values (p_job, v_key, (now() at time zone 'Asia/Seoul')::date)
  on conflict do nothing;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    update public.job_posts set view_count = view_count + 1 where id = p_job;
  end if;
end;
$$;

revoke execute on function public.record_job_view(uuid, text) from public;
grant execute on function public.record_job_view(uuid, text) to anon, authenticated;

-- 서류 사실: 종류별 유효 서류(effective_doc)의 종류·유효기간·확인일·단체·등급만.
-- 파일 경로·번호·반려 사유는 절대 내보내지 않는다. 신분증도 "확인됨" 사실만.
-- 센터 역할 계정의 사실은 누구나(센터 공개 페이지), 그 밖(강사)은 그 사람의 이름을 볼 수 있는
-- 사용자(can_view_profile: 본인·관리자·공개 강사를 보는 센터·지원받은 센터)만.
create or replace function public.get_public_facts(p_user uuid)
returns table (doc_type text, valid_until date, verified_at timestamptz, org text, grade text)
language sql
stable
security definer
set search_path = public
as $$
  select e.doc_type, e.valid_until, e.verified_at,
         nullif(btrim(e.meta ->> 'org'), ''), nullif(btrim(e.meta ->> 'grade'), '')
  from (
    select distinct d.doc_type
    from public.documents d
    where d.owner_id = p_user and d.status = 'verified'
  ) t
  cross join lateral public.effective_doc(p_user, t.doc_type) e
  where e.id is not null
    and (
      exists (select 1 from public.profiles c where c.id = p_user and 'center' = any(c.roles))
      or (auth.uid() is not null and public.can_view_profile(p_user))
    )
  order by e.doc_type;
$$;

revoke execute on function public.get_public_facts(uuid) from public;
grant execute on function public.get_public_facts(uuid) to anon, authenticated;

-- 센터 공개 프로필(§6). 센터명·주 교육 장소·교육 요일·시간대·사진은 누구나.
-- 대표자·대표강사·소속강사·월 교육생·주소는 로그인 + can_view_job_detail()(또는 본인)일 때만.
create or replace function public.get_center_public_profile(p_center uuid)
returns table (
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
  with v as (
    select (auth.uid() is not null and (p_center = auth.uid() or public.can_view_job_detail())) as ok
  )
  select
    p.id,
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
  from public.profiles p
  left join public.center_profiles cp on cp.user_id = p.id
  cross join v
  where p.id = p_center
    and 'center' = any(p.roles)
    and (p.account_status = 'active' or p.id = auth.uid() or public.is_admin());
$$;

revoke execute on function public.get_center_public_profile(uuid) from public;
grant execute on function public.get_center_public_profile(uuid) to anon, authenticated;

-- 센터 공고 이력(§6): 지금까지 올린 공고와 제시 단가. 숨김 공고·정지 센터는 없음. 최근 50건.
create or replace function public.list_center_job_history(p_center uuid)
returns table (
  id uuid, title text, job_type text, pay_amount int, pay_unit text,
  created_at timestamptz, effective_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.title, s.job_type, s.pay_amount, s.pay_unit, s.created_at, s.effective_status
  from public.job_summary_rows(null, p_center, true) s
  where p_center is not null
  order by s.created_at desc, s.id
  limit 50;
$$;

revoke execute on function public.list_center_job_history(uuid) from public;
grant execute on function public.list_center_job_history(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. 로그인 읽기 RPC
-- ---------------------------------------------------------------------

-- 공고 상세: 요약 + 상세 설명 + 센터 상세(연락처 없음). 로그인 + can_view_job_detail 필요.
-- 숨김·정지 센터 공고는 주인·관리자만.
create or replace function public.get_job_detail(p_job uuid)
returns table (
  id uuid, owner_id uuid, center_name text, job_type text, title text, region text, venue text,
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

  v_public := not (
    public.is_admin()
    or exists (select 1 from public.job_posts x where x.id = p_job and x.owner_id = v_uid)
  );

  return query
  select s.*,
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
  left join public.center_profiles cp on cp.user_id = s.owner_id
  where p_job is not null;
end;
$$;

revoke execute on function public.get_job_detail(uuid) from public, anon;
grant execute on function public.get_job_detail(uuid) to authenticated;

-- 지원자 연락처: 공고 주인(활성)이고 그 지원이 '선택됨'일 때만 1행. 그 외는 빈 결과.
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
  where a.id = p_app
    and a.status = 'selected'
    and auth.uid() is not null
    and j.owner_id = auth.uid()
    and public.is_active();
$$;

revoke execute on function public.get_applicant_contact(uuid) from public, anon;
grant execute on function public.get_applicant_contact(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. 쓰기 RPC (로그인 + 활성)
-- ---------------------------------------------------------------------

-- 마감 지난 open 공고 → closed/expired, 남은 '지원함' → '미선택'. 처리한 공고 수를 돌려준다.
-- 읽기 RPC는 job_effective_status로 판단하므로 이 정리가 늦어도 화면 상태는 맞다.
-- 앱은 "내 지원 현황"·"내 공고"를 읽기 전에 불러 저장 상태를 맞춘다.
-- 다른 호출이 잠근 공고는 건너뛴다(skip locked) — 동시에 불러도 서로 기다리지 않는다.
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

  return cardinality(v_ids);
end;
$$;

revoke execute on function public.expire_jobs() from public, anon;
grant execute on function public.expire_jobs() to authenticated;

-- 공고 등록: 활성 센터 + requirement_rules('post_'||종류)의 서류가 유효해야 한다.
create or replace function public.create_job_post(payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_type text := payload ->> 'job_type';
  r public.job_posts;
  v_id uuid;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 공고를 올릴 수 있어요' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and 'center' = any(p.roles)) then
    raise exception '센터 계정만 공고를 올릴 수 있어요' using errcode = '42501';
  end if;
  if v_type is null or v_type not in ('lesson', 'affiliation', 'tour') then
    raise exception '공고 종류가 올바르지 않아요' using errcode = '22023';
  end if;
  if not public.has_requirements(v_uid, 'post_' || v_type) then
    raise exception '이 종류의 공고를 올리는 데 필요한 서류가 아직 확인되지 않았어요' using errcode = '42501';
  end if;

  r := public.job_post_from_payload(payload, v_type);

  insert into public.job_posts (
    owner_id, job_type, title, region, venue,
    class_date, start_time, end_time, work_days, work_time,
    tour_start, tour_end, destination, destination_kind, covers_flight, covers_lodging,
    pay_amount, pay_unit, headcount, requirement_tags, description, deadline
  ) values (
    v_uid, r.job_type, r.title, r.region, r.venue,
    r.class_date, r.start_time, r.end_time, r.work_days, r.work_time,
    r.tour_start, r.tour_end, r.destination, r.destination_kind, r.covers_flight, r.covers_lodging,
    r.pay_amount, r.pay_unit, r.headcount, r.requirement_tags, r.description, r.deadline
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_job_post(jsonb) from public, anon;
grant execute on function public.create_job_post(jsonb) to authenticated;

-- 공고 수정: 주인만, 모집 중일 때만. 종류는 바꿀 수 없다(payload의 job_type은 무시).
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

-- 공고 마감(직접): 주인만. 저장 상태가 open일 때만 → closed/manual, 남은 지원함 → 미선택.
create or replace function public.close_job_post(p_job uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.job_posts;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 공고를 마감할 수 있어요' using errcode = '42501';
  end if;

  select * into v_job from public.job_posts where id = p_job for update;
  if not found then
    raise exception '공고를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_job.owner_id is distinct from v_uid then
    raise exception '내 공고만 마감할 수 있어요' using errcode = '42501';
  end if;
  if v_job.status <> 'open' then
    raise exception '이미 마감된 공고예요' using errcode = '22023';
  end if;

  perform public.close_job_with_reason(p_job, 'manual');
end;
$$;

revoke execute on function public.close_job_post(uuid) from public, anon;
grant execute on function public.close_job_post(uuid) to authenticated;

-- 지원: 활성 강사, 상세 열람 가능, 모집 중, 본인 공고 아님. 한마디는 선택(200자 이내).
-- 이미 지원했다가 취소했으면 '지원함'으로 되살린다(같은 행). 그 밖의 중복은 거부.
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
  if not public.can_view_job_detail(p_job) then
    raise exception '공고 상세를 볼 수 있어야 지원할 수 있어요' using errcode = '42501';
  end if;
  if v_msg is not null and char_length(v_msg) > 200 then
    raise exception '한마디는 200자까지 쓸 수 있어요' using errcode = '22023';
  end if;

  -- 선택·마감과 겹치지 않게 공고 행을 잠근다(공유 잠금: 지원끼리는 서로 막지 않는다)
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

-- 지원 취소: 본인, '지원함'일 때만(선택된 뒤에는 불가).
create or replace function public.withdraw_application(p_app uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.job_applications;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 지원을 취소할 수 있어요' using errcode = '42501';
  end if;

  select * into v_app from public.job_applications where id = p_app for update;
  if not found then
    raise exception '지원 내역을 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_app.instructor_id is distinct from v_uid then
    raise exception '내 지원만 취소할 수 있어요' using errcode = '42501';
  end if;
  if v_app.status <> 'applied' then
    raise exception '지원함 상태에서만 취소할 수 있어요' using errcode = '22023';
  end if;

  update public.job_applications set status = 'withdrawn', decided_at = now() where id = p_app;
end;
$$;

revoke execute on function public.withdraw_application(uuid) from public, anon;
grant execute on function public.withdraw_application(uuid) to authenticated;

-- 지원자 선택: 공고 주인(활성)만. 공고 행을 FOR UPDATE로 잠근 뒤 선택 수를 세서 인원을 지킨다.
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

  select * into v_app from public.job_applications where id = p_app for update;
  if v_app.status is distinct from 'applied' then
    raise exception '지원함 상태의 지원자만 선택할 수 있어요' using errcode = '22023';
  end if;
  if public.job_effective_status(v_job) <> 'open' then
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
