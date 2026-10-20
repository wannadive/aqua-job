-- =====================================================================
-- 아쿠아잡 1단계 기반 스키마: 회원·연락처·이력서·서류·요건 규칙·관리자 기록
-- 보안 핵심: 연락처(private_contacts)와 서류 원본(documents 버킷)은 본인·관리자만.
-- Supabase SQL Editor에서 한 번에 실행한다. 다시 실행해도 깨지지 않게 썼다.
--
-- [관리자 지정] 마이그레이션 실행 후, 관리자로 쓸 계정으로 먼저 앱에서 강사/센터로 가입한 다음
-- (대시보드 Add user·초대·OAuth는 가입 유형 정보가 없어 트리거가 거부한다)
-- 아래 한 줄의 이메일을 바꿔 SQL Editor에서 실행한다(postgres 권한이라 트리거 통과).
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = '관리자@이메일');
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('instructor', 'center', 'admin')),
  display_name text not null,
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'banned')),
  center_id uuid null, -- 핀프렌즈 대비, 지금은 null
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.private_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  email text
);

create table if not exists public.instructor_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gender text,
  age_band text,
  regions text[] not null default '{}',
  photo_path text,
  mbti text,
  intro text,
  teaching_style_tags text[] not null default '{}',
  teaching_style_note text,
  certifications jsonb not null default '[]', -- [{org, level}]
  instructor_level text,
  instructor_years int,
  students_taught int,
  records jsonb not null default '{}', -- {sta_sec, dyn_m, cwt_m, fim_m}
  past_centers text[] not null default '{}',
  tour_experience text,
  languages text[] not null default '{}',
  other_certs text[] not null default '{}',
  available_days text[] not null default '{}',
  available_time text,
  scopes text[] not null default '{}', -- pool | sea | overseas_tour
  desired_rate text,
  is_public boolean not null default true,
  onboarding_done boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.center_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  center_name text,
  representative_name text,
  head_instructor text,
  instructor_count int,
  instructor_names text[] not null default '{}',
  monthly_students int,
  teaching_days text[] not null default '{}',
  teaching_time text,
  venues text[] not null default '{}',
  address text,
  photo_paths text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- doc_type 목록은 lib/verification/config.ts의 DOC_TYPES와 같아야 한다.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'instructor_cert', 'liability_insurance', 'first_aid', 'id_card',
    'business_registration', 'travel_business', 'representative_id', 'rep_instructor_cert'
  )),
  status text not null default 'submitted' check (status in ('submitted', 'verified', 'rejected')),
  file_path text null, -- 신분증은 확인 후 null
  valid_until date null,
  meta jsonb not null default '{}',
  reject_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz
);

create index if not exists documents_owner_type_idx
  on public.documents (owner_id, doc_type, submitted_at desc);
create index if not exists documents_status_idx on public.documents (status);

-- "어떤 행동에 어떤 확인 서류가 필요한가" 설정표 (설계 §7). 규칙은 여기 한 곳에서만 관리한다.
create table if not exists public.requirement_rules (
  action text not null,
  doc_type text not null,
  primary key (action, doc_type)
);

insert into public.requirement_rules (action, doc_type) values
  ('post_lesson', 'business_registration'),
  ('post_affiliation', 'business_registration'),
  ('post_tour', 'business_registration'),
  ('post_tour', 'travel_business'),
  ('send_offer', 'business_registration')
on conflict do nothing;

-- 1단계에서는 서류 확인/반려만 기록한다.
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_target_idx on public.admin_actions (target_user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. 헬퍼 함수
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and account_status = 'active'
  );
$$;

create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_status = 'active'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists instructor_profiles_set_updated_at on public.instructor_profiles;
create trigger instructor_profiles_set_updated_at before update on public.instructor_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists center_profiles_set_updated_at on public.center_profiles;
create trigger center_profiles_set_updated_at before update on public.center_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. 가입 트리거: auth.users → profiles + private_contacts
--    role은 instructor | center만 받는다. admin 등 다른 값이면 가입 자체를 막는다.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
  v_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  v_phone text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
begin
  if v_role is null or v_role not in ('instructor', 'center') then
    raise exception '가입 유형이 올바르지 않아요 (강사 또는 센터만 가입할 수 있어요)'
      using errcode = '22023';
  end if;

  insert into public.profiles (id, role, display_name)
  values (new.id, v_role, coalesce(v_name, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), '회원'));

  insert into public.private_contacts (user_id, phone, email)
  values (new.id, v_phone, new.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. 역할·상태 변조 방지: role, account_status, center_id는
--    관리자 또는 서버 세션(postgres·service_role)만 바꿀 수 있다.
--    SECURITY INVOKER로 둬야 current_user가 실제 호출자를 가리킨다.
-- ---------------------------------------------------------------------

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.role is distinct from old.role
      or new.account_status is distinct from old.account_status
      or new.center_id is distinct from old.center_id
      or new.id is distinct from old.id)
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_admin() then
    raise exception '역할·계정 상태는 직접 바꿀 수 없어요' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.private_contacts enable row level security;
alter table public.instructor_profiles enable row level security;
alter table public.center_profiles enable row level security;
alter table public.documents enable row level security;
alter table public.requirement_rules enable row level security;
alter table public.admin_actions enable row level security;

-- profiles: 로그인 사용자 조회, 본인만 수정(특권 컬럼은 위 트리거가 막음)
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- private_contacts: 본인·관리자만 조회, 본인만 수정
drop policy if exists private_contacts_select_own_or_admin on public.private_contacts;
create policy private_contacts_select_own_or_admin on public.private_contacts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists private_contacts_update_own on public.private_contacts;
create policy private_contacts_update_own on public.private_contacts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- instructor_profiles: 본인·관리자, 그리고 공개 프로필은 센터만 조회. 쓰기는 활성 상태의 본인 강사만.
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
        where p.id = (select auth.uid()) and p.role = 'center'
      )
    )
  );

drop policy if exists instructor_profiles_insert_own on public.instructor_profiles;
create policy instructor_profiles_insert_own on public.instructor_profiles
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'instructor'
    )
  );

drop policy if exists instructor_profiles_update_own on public.instructor_profiles;
create policy instructor_profiles_update_own on public.instructor_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()))
  with check (user_id = (select auth.uid()) and (select public.is_active()));

-- center_profiles: 로그인 사용자 조회. 쓰기는 활성 상태의 본인 센터만.
drop policy if exists center_profiles_select_authenticated on public.center_profiles;
create policy center_profiles_select_authenticated on public.center_profiles
  for select to authenticated using (true);

drop policy if exists center_profiles_insert_own on public.center_profiles;
create policy center_profiles_insert_own on public.center_profiles
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'center'
    )
  );

drop policy if exists center_profiles_update_own on public.center_profiles;
create policy center_profiles_update_own on public.center_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()))
  with check (user_id = (select auth.uid()) and (select public.is_active()));

-- documents: 본인·관리자 조회. 활성 상태의 본인만 '제출됨' 상태로 등록.
-- 확인/반려(update)는 review_document RPC로만 한다(update·delete 정책 없음).
drop policy if exists documents_select_own_or_admin on public.documents;
create policy documents_select_own_or_admin on public.documents
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists documents_insert_own_submitted on public.documents;
create policy documents_insert_own_submitted on public.documents
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.is_active())
    and status = 'submitted'
    and valid_until is null
    and reject_reason is null
    and reviewed_by is null
    and verified_at is null
    -- 남의 파일 경로를 자기 서류로 걸어 관리자 화면에 띄우는 것을 막는다
    and (file_path is null or split_part(file_path, '/', 1) = (select auth.uid())::text)
    -- 미래 시각으로 넣어 '최신 서류' 자리를 붙잡아 두는 것을 막는다
    and submitted_at <= now() + interval '1 minute'
  );

-- requirement_rules: 누구나 조회(화면 안내용). 변경은 SQL로만.
drop policy if exists requirement_rules_select_all on public.requirement_rules;
create policy requirement_rules_select_all on public.requirement_rules
  for select to anon, authenticated using (true);

-- admin_actions: 관리자만 조회. 기록은 RPC가 한다.
drop policy if exists admin_actions_select_admin on public.admin_actions;
create policy admin_actions_select_admin on public.admin_actions
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 6. RPC: 서류 확인/반려 (관리자 전용)
--    유효기간이 있는 서류(hasExpiry) 목록은 lib/verification/config.ts와 같아야 한다.
--    신분증(id_card, representative_id) 원본은 이 RPC가 지우지 않는다. 확인 뒤 관리자 화면이
--    POST /api/admin/purge-original {docId}를 부르면, 서버(service role)가 documents.file_path의
--    Storage 객체를 지우고 그다음 file_path를 null로 바꾼다(SQL에서 storage.objects 직접 삭제 불가).
--    그래서 여기서 file_path를 먼저 비우면 안 된다(지울 경로를 잃는다).
-- ---------------------------------------------------------------------

create or replace function public.review_document(
  p_doc_id uuid,
  p_decision text,
  p_valid_until date default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
  v_has_expiry boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception '관리자만 서류를 확인할 수 있어요' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('verified', 'rejected') then
    raise exception '처리 결과는 verified 또는 rejected여야 해요' using errcode = '22023';
  end if;

  select * into v_doc from public.documents where id = p_doc_id for update;
  if not found then
    raise exception '서류를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'submitted' then
    raise exception '이미 처리된 서류예요' using errcode = '22023';
  end if;

  v_has_expiry := v_doc.doc_type in
    ('instructor_cert', 'liability_insurance', 'first_aid', 'rep_instructor_cert');

  if p_decision = 'verified' then
    if v_has_expiry and p_valid_until is null then
      raise exception '유효기간을 입력해 주세요' using errcode = '22023';
    end if;

    update public.documents set
      status = 'verified',
      valid_until = case when v_has_expiry then p_valid_until else null end,
      reject_reason = null,
      reviewed_by = auth.uid(),
      verified_at = now()
    where id = p_doc_id;
  else
    if v_reason is null then
      raise exception '반려 사유를 입력해 주세요' using errcode = '22023';
    end if;

    update public.documents set
      status = 'rejected',
      reject_reason = v_reason,
      reviewed_by = auth.uid(),
      verified_at = null
    where id = p_doc_id;
  end if;

  insert into public.admin_actions (admin_id, target_user_id, action, reason)
  values (
    auth.uid(),
    v_doc.owner_id,
    case when p_decision = 'verified' then 'document_verified' else 'document_rejected' end,
    concat_ws(' · ', v_doc.doc_type, v_reason)
  );
end;
$$;

revoke execute on function public.review_document(uuid, text, date, text) from public, anon;
grant execute on function public.review_document(uuid, text, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. RPC: 행동 요건 충족 여부 (2단계 공고 등록·제안에서 사용)
--    requirement_rules의 모든 서류에 대해 최신 '확인됨' 서류가 있고, 유효기간(KST 기준)이
--    지나지 않았으면 true. 규칙이 없는 행동은 true.
--    본인 것만 물어볼 수 있다(관리자는 누구든). 뒤 단계의 SECURITY DEFINER RPC는
--    auth.uid()를 넘겨 부르면 된다(auth.uid()는 definer 안에서도 호출자 그대로).
-- ---------------------------------------------------------------------

create or replace function public.has_requirements(p_user uuid, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user is distinct from auth.uid() and not public.is_admin() then
    raise exception '본인 요건만 확인할 수 있어요' using errcode = '42501';
  end if;

  return not exists (
    select 1
    from public.requirement_rules r
    where r.action = p_action
      and not coalesce((
        select d.valid_until is null
               or d.valid_until >= (now() at time zone 'Asia/Seoul')::date
        from public.documents d
        where d.owner_id = p_user
          and d.doc_type = r.doc_type
          and d.status = 'verified'
        order by d.verified_at desc nulls last, d.submitted_at desc
        limit 1
      ), false)
  );
end;
$$;

revoke execute on function public.has_requirements(uuid, text) from public, anon;
grant execute on function public.has_requirements(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Storage
--    documents(비공개): {owner_id}/{uuid}.{ext} — 본인 올리기·보기·지우기, 관리자 보기·지우기
--    avatars(공개 읽기): {uid}/{uuid}.{ext} — 올리기·바꾸기·지우기는 활성 상태의 본인만
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists documents_owner_insert on storage.objects;
create policy documents_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active())
  );

drop policy if exists documents_owner_select on storage.objects;
create policy documents_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists documents_owner_delete on storage.objects;
create policy documents_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists documents_admin_select on storage.objects;
create policy documents_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (select public.is_admin()));

drop policy if exists documents_admin_delete on storage.objects;
create policy documents_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (select public.is_admin()));

-- avatars: 공개 URL로 누구나 볼 수 있다(공개 버킷). 목록 조회·덮어쓰기용 select는 본인 폴더만.
drop policy if exists avatars_owner_select on storage.objects;
create policy avatars_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active())
  );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active())
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active())
  );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active())
  );
