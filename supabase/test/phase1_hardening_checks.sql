-- =====================================================================
-- 아쿠아잡 1단계 보강 검사 (개발/테스트 전용)
-- 먼저 supabase/migrations/20261022_002_hardening.sql 을 실행한 뒤에 돌린다.
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다.
-- 성공하면 마지막에 'hardening ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자 (강사E — 나중에 퇴출, 강사G — 활성, 센터F — 활성)
--   E = b0000000-0000-4000-8000-0000000000e1
--   G = b0000000-0000-4000-8000-0000000000a2
--   F = b0000000-0000-4000-8000-0000000000f1
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-0000000000e1',
   'authenticated', 'authenticated', 'hardening-e@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사E","phone":"010-5555-5555"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'hardening-g@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사G","phone":"010-7777-7777"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-0000000000f1',
   'authenticated', 'authenticated', 'hardening-f@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"센터F","phone":"010-6666-6666"}', now(), now());

-- 일부 Supabase 버전은 storage.objects를 SQL로 직접 지우는 것을 막는 트리거가 있다.
-- 이 검사는 정책(RLS)만 보려는 것이므로 그 안전장치를 이 트랜잭션에서만 끈다(설정이 없으면 아무 일도 없음).
select set_config('storage.allow_delete_query', 'true', true);

-- 강사E의 서류 파일 자리 두 개(대조군에서 하나 지우고, 퇴출 뒤 하나를 지워 본다)
insert into storage.objects (bucket_id, name, owner) values
  ('verification-docs', 'b0000000-0000-4000-8000-0000000000e1/control.jpg', 'b0000000-0000-4000-8000-0000000000e1'),
  ('verification-docs', 'b0000000-0000-4000-8000-0000000000e1/keep.jpg', 'b0000000-0000-4000-8000-0000000000e1');

-- ---------------------------------------------------------------------
-- 대조군: 활성 상태의 강사E는 이름·연락처를 고치고 자기 파일을 지울 수 있다
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-0000000000e1', 'role', 'authenticated')::text, true);

  update public.profiles set display_name = '강사E2' where id = 'b0000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'hardening_control 실패 (활성 상태 이름 수정 %행)', n; end if;

  update public.private_contacts set phone = '010-5555-0000' where user_id = 'b0000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'hardening_control 실패 (활성 상태 연락처 수정 %행)', n; end if;

  delete from storage.objects
    where bucket_id = 'verification-docs' and name = 'b0000000-0000-4000-8000-0000000000e1/control.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'hardening_control 실패 (활성 상태 파일 삭제 %행)', n; end if;

  reset role;
end $$;

-- 강사E 퇴출 (운영과 같은 방식: postgres 세션의 update)
update public.profiles set account_status = 'banned' where id = 'b0000000-0000-4000-8000-0000000000e1';

-- ---------------------------------------------------------------------
-- banned_cannot_update_profile_name: 퇴출된 강사E는 이름을 바꿀 수 없다
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_name text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-0000000000e1', 'role', 'authenticated')::text, true);
  begin
    update public.profiles set display_name = '퇴출 뒤 이름' where id = 'b0000000-0000-4000-8000-0000000000e1';
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := 0;
  end;
  reset role;

  select display_name into v_name from public.profiles where id = 'b0000000-0000-4000-8000-0000000000e1';
  if n <> 0 or v_name <> '강사E2' then
    raise exception 'banned_cannot_update_profile_name 실패 (수정 %행, 이름 %)', n, v_name;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- banned_cannot_update_contacts: 퇴출된 강사E는 연락처를 바꿀 수 없다
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_phone text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-0000000000e1', 'role', 'authenticated')::text, true);
  begin
    update public.private_contacts set phone = '010-9999-9999' where user_id = 'b0000000-0000-4000-8000-0000000000e1';
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := 0;
  end;
  reset role;

  select phone into v_phone from public.private_contacts where user_id = 'b0000000-0000-4000-8000-0000000000e1';
  if n <> 0 or v_phone <> '010-5555-0000' then
    raise exception 'banned_cannot_update_contacts 실패 (수정 %행)', n;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- banned_cannot_delete_document_object: 퇴출된 강사E는 verification-docs 버킷의 자기 파일을 지울 수 없다
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_left int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-0000000000e1', 'role', 'authenticated')::text, true);
  begin
    delete from storage.objects
      where bucket_id = 'verification-docs' and name = 'b0000000-0000-4000-8000-0000000000e1/keep.jpg';
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := 0;
  end;
  reset role;

  select count(*) into v_left from storage.objects
    where bucket_id = 'verification-docs' and name = 'b0000000-0000-4000-8000-0000000000e1/keep.jpg';
  if n <> 0 or v_left <> 1 then
    raise exception 'banned_cannot_delete_document_object 실패 (삭제 %행, 남은 파일 %)', n, v_left;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- instructor_cannot_insert_center_doc_type: 강사G는 사업자등록증을 낼 수 없고,
--   센터F는 강사 신분증 종류(id_card)를 낼 수 없다. 대조군: 각자 맞는 종류는 된다.
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean;
begin
  set local role authenticated;

  -- 대조군: 강사G 자격증, 센터F 사업자등록증은 들어간다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  insert into public.verification_documents (owner_id, doc_type, file_path)
  values ('b0000000-0000-4000-8000-0000000000a2', 'instructor_cert',
          'b0000000-0000-4000-8000-0000000000a2/cert.jpg');

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-0000000000f1', 'role', 'authenticated')::text, true);
  insert into public.verification_documents (owner_id, doc_type, file_path)
  values ('b0000000-0000-4000-8000-0000000000f1', 'business_registration',
          'b0000000-0000-4000-8000-0000000000f1/biz.jpg');

  -- 강사G가 센터 서류 종류를 내면 거부
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    insert into public.verification_documents (owner_id, doc_type, file_path)
    values ('b0000000-0000-4000-8000-0000000000a2', 'business_registration',
            'b0000000-0000-4000-8000-0000000000a2/biz.jpg');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'instructor_cannot_insert_center_doc_type 실패 (강사가 사업자등록증 제출)';
  end if;

  -- 센터F가 강사 서류 종류를 내면 거부
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-0000000000f1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    insert into public.verification_documents (owner_id, doc_type, file_path)
    values ('b0000000-0000-4000-8000-0000000000f1', 'id_card',
            'b0000000-0000-4000-8000-0000000000f1/id.jpg');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'instructor_cannot_insert_center_doc_type 실패 (센터가 강사 신분증 종류 제출)';
  end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- insert_requires_file_path: 사진 경로 없이 서류를 낼 수 없다
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  begin
    insert into public.verification_documents (owner_id, doc_type, file_path)
    values ('b0000000-0000-4000-8000-0000000000a2', 'first_aid', null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;

  if not v_blocked then
    raise exception 'insert_requires_file_path 실패';
  end if;
end $$;

rollback;

select 'hardening ok' as result;
