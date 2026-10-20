-- =====================================================================
-- 아쿠아잡 1단계: 한 계정 여러 역할 (관리자 · 강사 · 센터)
-- 001 → 002를 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(if not exists, drop … if exists → create, create or replace).
--
-- - profiles.roles text[]: 이 계정이 가진 역할 전부. 원소는 instructor·center·admin, 비어 있으면 안 된다.
-- - profiles.role은 그대로 둔다(대표 역할). 항상 roles 안에 있다.
--   일반 가입은 지금처럼 역할 하나(roles = {role}). 여러 역할은 관리자 SQL로만 준다(맨 아래).
-- - 예전 방식으로 role만 바꾸면(예: update … set role = 'admin') 그 역할이 roles에 더해진다.
-- - 권한 확인은 전부 roles로 한다: 관리자 = 'admin' = any(roles), 서류 종류는 가진 역할들의 합.
-- - roles도 role·account_status처럼 관리자·서버만 바꿀 수 있다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 컬럼 + 기존 행 채우기
-- ---------------------------------------------------------------------

alter table public.profiles add column if not exists roles text[] not null default '{}';

-- role ↔ roles 맞추기: 비어 있으면 {role}, role만 바뀌면 roles에 더하고,
-- 대표 역할(role)이 roles에 없으면 roles 중 하나(관리자 우선)로 맞춘다.
-- 특권 컬럼 검사(profiles_guard_privileged)가 이름순으로 먼저 돌기 때문에 사용자 변조는 그쪽에서 막힌다.
create or replace function public.sync_profile_roles()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.roles is null or cardinality(new.roles) = 0 then
    new.roles := array[new.role];
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       and new.roles is not distinct from old.roles
       and not (new.role = any(new.roles)) then
      new.roles := new.roles || new.role;
    end if;
  end if;

  if not (new.role = any(new.roles)) then
    new.role := case when 'admin' = any(new.roles) then 'admin' else new.roles[1] end;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_roles on public.profiles;
create trigger profiles_sync_roles before insert or update on public.profiles
  for each row execute function public.sync_profile_roles();

-- 기존 회원: roles = {role}
update public.profiles set roles = array[role]
where roles is null or cardinality(roles) = 0;

alter table public.profiles drop constraint if exists profiles_roles_valid;
alter table public.profiles add constraint profiles_roles_valid check (
  cardinality(roles) > 0
  and roles <@ array['instructor', 'center', 'admin']::text[]
  and array_position(roles, null) is null
);

alter table public.profiles drop constraint if exists profiles_role_in_roles;
alter table public.profiles add constraint profiles_role_in_roles check (role = any(roles));

-- ---------------------------------------------------------------------
-- 2. 헬퍼: 관리자 = roles에 admin이 있고 활성 상태
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
    where id = auth.uid() and 'admin' = any(roles) and account_status = 'active'
  );
$$;

-- ---------------------------------------------------------------------
-- 3. 가입 트리거: 역할 하나로 가입(roles = {role}). instructor | center만 받는다.
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

  insert into public.profiles (id, role, roles, display_name)
  values (new.id, v_role, array[v_role],
          coalesce(v_name, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), '회원'));

  insert into public.private_contacts (user_id, phone, email)
  values (new.id, v_phone, new.email);

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 특권 컬럼: role, roles, account_status, center_id, id는 관리자·서버만
-- ---------------------------------------------------------------------

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.role is distinct from old.role
      or new.roles is distinct from old.roles
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

-- ---------------------------------------------------------------------
-- 5. RLS: role 대신 roles로 확인
-- ---------------------------------------------------------------------

-- instructor_profiles: 본인·관리자, 그리고 공개 프로필은 센터 역할이 있는 계정만 조회
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
  );

-- instructor_profiles 만들기: 활성 상태이고 강사 역할이 있는 본인
drop policy if exists instructor_profiles_insert_own on public.instructor_profiles;
create policy instructor_profiles_insert_own on public.instructor_profiles
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and 'instructor' = any(p.roles)
    )
  );

-- center_profiles 만들기: 활성 상태이고 센터 역할이 있는 본인
drop policy if exists center_profiles_insert_own on public.center_profiles;
create policy center_profiles_insert_own on public.center_profiles
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and 'center' = any(p.roles)
    )
  );

-- documents 등록: 002 조건 그대로, 서류 종류만 "가진 역할들의 서류 종류 합"으로
-- (서류 종류 목록은 lib/verification/config.ts의 DOC_TYPES.owner와 같아야 한다)
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
    and file_path is not null
    and split_part(file_path, '/', 1) = (select auth.uid())::text
    and submitted_at <= now() + interval '1 minute'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and (
          ('instructor' = any(p.roles)
           and documents.doc_type in ('instructor_cert', 'liability_insurance', 'first_aid', 'id_card'))
          or ('center' = any(p.roles)
           and documents.doc_type in ('business_registration', 'travel_business', 'representative_id', 'rep_instructor_cert'))
        )
    )
  );

-- review_document·has_requirements·Storage 정책은 is_admin()/is_active()만 쓰므로 그대로 둔다.
-- 서버의 원본 삭제(/api/admin/purge-original)도 roles로 관리자를 확인한다.

-- =====================================================================
-- [한 번만] 운영자 계정에 관리자·강사·센터 역할 모두 주기
-- 앱에서 강사나 센터로 먼저 가입한 계정의 이메일로 바꿔, 주석을 풀고 SQL Editor에서 실행한다.
-- (postgres 권한이라 특권 컬럼 검사를 통과한다. 앱 화면에서는 역할을 바꿀 수 없다)
--
-- update public.profiles
--   set roles = array['admin', 'instructor', 'center'], role = 'admin'
--   where id = (select id from auth.users where email = '관리자@이메일');
--
-- 예) 테스트 관리자:
-- update public.profiles
--   set roles = array['admin', 'instructor', 'center'], role = 'admin'
--   where id = (select id from auth.users where email = 'test-admin-1@aquajob.test');
-- =====================================================================
