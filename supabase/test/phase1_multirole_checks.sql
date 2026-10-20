-- =====================================================================
-- 아쿠아잡 1단계 여러 역할 검사 (개발/테스트 전용)
-- 먼저 supabase/migrations/20261022_003_multi_role.sql 을 실행한 뒤에 돌린다.
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다.
-- 성공하면 마지막에 'multirole ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자
--   M = c0000000-0000-4000-8000-0000000000a1  관리자·강사·센터 (강사로 가입 → SQL로 역할 추가)
--   K = c0000000-0000-4000-8000-0000000000a2  강사·센터 (강사로 가입 → SQL로 센터 추가)
--   S = c0000000-0000-4000-8000-0000000000a3  강사만
--   P = c0000000-0000-4000-8000-0000000000a4  강사만, 공개 이력서 주인
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'multirole-m@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"운영자M"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'multirole-k@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사센터K"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-0000000000a3',
   'authenticated', 'authenticated', 'multirole-s@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사S"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-0000000000a4',
   'authenticated', 'authenticated', 'multirole-p@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사P"}', now(), now());

-- 가입 직후에는 역할 하나(roles = {role})
do $$
declare
  v_roles text[];
begin
  select roles into v_roles from public.profiles where id = 'c0000000-0000-4000-8000-0000000000a3';
  if v_roles is distinct from array['instructor'] then
    raise exception 'signup_single_role 실패 (roles %)', v_roles;
  end if;
end $$;

-- 운영과 같은 방식(postgres 세션의 update)으로 역할을 준다
update public.profiles set roles = array['admin', 'instructor', 'center'], role = 'admin'
where id = 'c0000000-0000-4000-8000-0000000000a1';
update public.profiles set roles = array['instructor', 'center']
where id = 'c0000000-0000-4000-8000-0000000000a2';

-- 강사P의 공개 이력서
insert into public.instructor_profiles (user_id, intro, is_public)
values ('c0000000-0000-4000-8000-0000000000a4', '공개 소개', true);

-- ---------------------------------------------------------------------
-- multi_role_admin_is_admin: 여러 역할 중 admin이 있으면 관리자.
--   대조군: 강사·센터K는 관리자가 아니다.
-- ---------------------------------------------------------------------
do $$
declare
  v_admin boolean;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c0000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_admin := public.is_admin();
  -- 관리자는 남의 연락처를 본다
  select count(*) into n from public.private_contacts where user_id = 'c0000000-0000-4000-8000-0000000000a3';
  if not v_admin or n <> 1 then
    raise exception 'multi_role_admin_is_admin 실패 (is_admin %, 연락처 %행)', v_admin, n;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c0000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  v_admin := public.is_admin();
  if v_admin then
    raise exception 'multi_role_admin_is_admin 실패 (강사·센터K가 관리자로 판정됨)';
  end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- roles_tamper_blocked: 관리자가 아닌 강사S가 자기 roles에 admin을 넣으면 거부
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean := false;
  v_roles text[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c0000000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text, true);
  begin
    update public.profiles set roles = array['instructor', 'admin'] where id = 'c0000000-0000-4000-8000-0000000000a3';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  -- 역할 하나를 더하는 것도(센터 추가) 막는다
  if v_blocked then
    v_blocked := false;
    begin
      update public.profiles set roles = array['instructor', 'center'] where id = 'c0000000-0000-4000-8000-0000000000a3';
    exception when insufficient_privilege then
      v_blocked := true;
    end;
  end if;
  reset role;

  select roles into v_roles from public.profiles where id = 'c0000000-0000-4000-8000-0000000000a3';
  if not v_blocked or v_roles is distinct from array['instructor'] then
    raise exception 'roles_tamper_blocked 실패 (roles %)', v_roles;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- multi_role_doc_types: 강사·센터K는 강사 서류와 센터 서류 둘 다 낼 수 있다.
--   강사만인 S는 여전히 센터 서류를 낼 수 없다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c0000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  insert into public.documents (owner_id, doc_type, file_path)
  values ('c0000000-0000-4000-8000-0000000000a2', 'instructor_cert',
          'c0000000-0000-4000-8000-0000000000a2/cert.jpg');
  insert into public.documents (owner_id, doc_type, file_path)
  values ('c0000000-0000-4000-8000-0000000000a2', 'business_registration',
          'c0000000-0000-4000-8000-0000000000a2/biz.jpg');
  select count(*) into n from public.documents where owner_id = 'c0000000-0000-4000-8000-0000000000a2';
  if n <> 2 then raise exception 'multi_role_doc_types 실패 (강사·센터K 서류 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c0000000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text, true);
  begin
    insert into public.documents (owner_id, doc_type, file_path)
    values ('c0000000-0000-4000-8000-0000000000a3', 'business_registration',
            'c0000000-0000-4000-8000-0000000000a3/biz.jpg');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'multi_role_doc_types 실패 (강사만인 S가 사업자등록증 제출)';
  end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- center_view_with_multi_role: 강사·센터K는 공개 이력서(강사P)를 볼 수 있다.
--   대조군: 강사만인 S는 못 본다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c0000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.instructor_profiles where user_id = 'c0000000-0000-4000-8000-0000000000a4';
  if n <> 1 then raise exception 'center_view_with_multi_role 실패 (강사·센터K가 %행 봄)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c0000000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text, true);
  select count(*) into n from public.instructor_profiles where user_id = 'c0000000-0000-4000-8000-0000000000a4';
  if n <> 0 then raise exception 'center_view_with_multi_role 실패 (강사만인 S가 %행 봄)', n; end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- multi_role_profiles_insert: 관리자·강사·센터M은 처음 강사 탭·센터 탭을 열 때
--   자기 instructor_profiles·center_profiles를 만들 수 있다
-- ---------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c0000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  begin
    insert into public.instructor_profiles (user_id) values ('c0000000-0000-4000-8000-0000000000a1');
    insert into public.center_profiles (user_id) values ('c0000000-0000-4000-8000-0000000000a1');
  exception when insufficient_privilege then
    raise exception 'multi_role_profiles_insert 실패';
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- legacy_role_update_adds_role: 예전 방식(role만 바꿈)은 그 역할을 roles에 더한다
-- ---------------------------------------------------------------------
do $$
declare
  v_roles text[];
begin
  update public.profiles set role = 'admin' where id = 'c0000000-0000-4000-8000-0000000000a4';
  select roles into v_roles from public.profiles where id = 'c0000000-0000-4000-8000-0000000000a4';
  if not ('admin' = any(v_roles) and 'instructor' = any(v_roles)) then
    raise exception 'legacy_role_update_adds_role 실패 (roles %)', v_roles;
  end if;
end $$;

rollback;

select 'multirole ok' as result;
