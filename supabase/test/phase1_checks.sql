-- =====================================================================
-- 아쿠아잡 1단계 보안 검사 (개발/테스트 전용)
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다.
-- 성공하면 마지막에 'phase1 ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자 (강사A, 강사B, 센터C, 관리자D). auth.users에 넣으면 가입 트리거가 돈다.
--   A = a0000000-0000-4000-8000-00000000000a
--   B = a0000000-0000-4000-8000-00000000000b
--   C = a0000000-0000-4000-8000-00000000000c
--   D = a0000000-0000-4000-8000-00000000000d (관리자)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'phase1-a@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사A","phone":"010-1111-1111"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000b',
   'authenticated', 'authenticated', 'phase1-b@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사B","phone":"010-2222-2222"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000c',
   'authenticated', 'authenticated', 'phase1-c@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"센터C","phone":"010-3333-3333"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000d',
   'authenticated', 'authenticated', 'phase1-d@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"관리자D"}', now(), now());

-- 관리자 지정은 운영과 같은 방식(postgres 세션의 update)으로 한다.
update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-00000000000d';

-- ---------------------------------------------------------------------
-- signup_role_whitelist: meta role='admin'으로 가입하면 예외
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-0000000000ee',
       'authenticated', 'authenticated', 'phase1-x@aquajob.test', '',
       '{}', '{"role":"admin","display_name":"해커"}', now(), now());
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'signup_role_whitelist 실패';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- rls_contacts_hidden: 강사B와 센터C로 강사A의 private_contacts를 select하면 0행
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  -- 대조군: 강사A 본인은 1행
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  select count(*) into n from public.private_contacts where user_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 1 then raise exception 'rls_contacts_hidden 실패 (본인 조회 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, true);
  select count(*) into n from public.private_contacts where user_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'rls_contacts_hidden 실패 (강사B가 %행 봄)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  select count(*) into n from public.private_contacts where user_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'rls_contacts_hidden 실패 (센터C가 %행 봄)', n; end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- rls_documents_private: 센터C가 강사A의 documents·storage.objects를 select하면 0행
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  -- 강사A가 자기 서류를 RLS를 거쳐 제출
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  insert into public.documents (id, owner_id, doc_type, file_path, meta)
  values ('d0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a',
          'instructor_cert', 'a0000000-0000-4000-8000-00000000000a/cert1.jpg',
          '{"org":"AIDA","grade":"강사"}');
  reset role;

  -- 파일 원본 자리(Storage 메타데이터 행)
  insert into storage.objects (bucket_id, name, owner)
  values ('documents', 'a0000000-0000-4000-8000-00000000000a/cert1.jpg',
          'a0000000-0000-4000-8000-00000000000a');

  set local role authenticated;

  -- 대조군: 강사A 본인은 서류 1행, 파일 1행
  select count(*) into n from public.documents where owner_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 1 then raise exception 'rls_documents_private 실패 (본인 서류 %행)', n; end if;
  select count(*) into n from storage.objects
    where bucket_id = 'documents' and name like 'a0000000-0000-4000-8000-00000000000a/%';
  if n <> 1 then raise exception 'rls_documents_private 실패 (본인 파일 %행)', n; end if;

  -- 센터C
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  select count(*) into n from public.documents where owner_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'rls_documents_private 실패 (센터C가 서류 %행 봄)', n; end if;
  select count(*) into n from storage.objects
    where bucket_id = 'documents' and name like 'a0000000-0000-4000-8000-00000000000a/%';
  if n <> 0 then raise exception 'rls_documents_private 실패 (센터C가 파일 %행 봄)', n; end if;

  -- 대조군: 관리자는 서류·파일을 본다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  select count(*) into n from public.documents where owner_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 1 then raise exception 'rls_documents_private 실패 (관리자 서류 %행)', n; end if;
  select count(*) into n from storage.objects
    where bucket_id = 'documents' and name like 'a0000000-0000-4000-8000-00000000000a/%';
  if n <> 1 then raise exception 'rls_documents_private 실패 (관리자 파일 %행)', n; end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- review_requires_admin: 강사B가 review_document를 호출하면 예외
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean := false;
  v_status text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, true);
  begin
    perform public.review_document('d0000000-0000-4000-8000-0000000000a1', 'verified', date '2027-03-31', null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;

  select status into v_status from public.documents where id = 'd0000000-0000-4000-8000-0000000000a1';
  if not v_blocked or v_status <> 'submitted' then
    raise exception 'review_requires_admin 실패';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- resubmit_after_reject: 관리자 반려 → 강사A가 같은 종류 재제출 → 2행, 최신 행은 'submitted'
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_latest text;
  v_first text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  perform public.review_document('d0000000-0000-4000-8000-0000000000a1', 'rejected', null, '사진이 흐려요');
  reset role;

  -- 같은 트랜잭션 안이라 now()가 같으므로, 첫 제출 시각을 1시간 앞으로 옮겨 순서를 만든다
  update public.documents set submitted_at = now() - interval '1 hour'
  where id = 'd0000000-0000-4000-8000-0000000000a1';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  insert into public.documents (owner_id, doc_type, file_path)
  values ('a0000000-0000-4000-8000-00000000000a', 'instructor_cert',
          'a0000000-0000-4000-8000-00000000000a/cert2.jpg');

  select count(*) into n from public.documents
    where owner_id = 'a0000000-0000-4000-8000-00000000000a' and doc_type = 'instructor_cert';
  select status into v_latest from public.documents
    where owner_id = 'a0000000-0000-4000-8000-00000000000a' and doc_type = 'instructor_cert'
    order by submitted_at desc limit 1;
  select status into v_first from public.documents where id = 'd0000000-0000-4000-8000-0000000000a1';
  reset role;

  if n <> 2 or v_latest <> 'submitted' or v_first <> 'rejected' then
    raise exception 'resubmit_after_reject 실패 (행 %, 최신 %, 첫 제출 %)', n, v_latest, v_first;
  end if;

  -- 반려 기록이 남았는지
  select count(*) into n from public.admin_actions
    where target_user_id = 'a0000000-0000-4000-8000-00000000000a' and action = 'document_rejected';
  if n <> 1 then raise exception 'resubmit_after_reject 실패 (관리자 기록 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- role_escalation_blocked: 강사A가 자기 profiles.role을 'admin'으로 update하면 거부
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean := false;
  v_role text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  begin
    update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-00000000000a';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;

  select role into v_role from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a';
  if not v_blocked or v_role <> 'instructor' then
    raise exception 'role_escalation_blocked 실패';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- banned_cannot_write: 강사A를 'banned'로 바꾸면 instructor_profiles update가 0행 또는 거부
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_intro text;
begin
  -- 대조군: 활성 상태에서는 만들고 고칠 수 있다
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  insert into public.instructor_profiles (user_id, intro) values ('a0000000-0000-4000-8000-00000000000a', '처음 소개');
  update public.instructor_profiles set intro = '고친 소개' where user_id = 'a0000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'banned_cannot_write 실패 (활성 상태 수정 %행)', n; end if;
  reset role;

  update public.profiles set account_status = 'banned' where id = 'a0000000-0000-4000-8000-00000000000a';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  begin
    update public.instructor_profiles set intro = '퇴출 뒤 소개' where user_id = 'a0000000-0000-4000-8000-00000000000a';
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := 0;
  end;
  reset role;

  select intro into v_intro from public.instructor_profiles where user_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 0 or v_intro <> '고친 소개' then
    raise exception 'banned_cannot_write 실패 (수정 %행, 소개 %)', n, v_intro;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- banned_cannot_upload_avatar: 퇴출된 강사A는 avatars 버킷에 올릴 수 없다
--   (위 검사에서 강사A는 이미 banned 상태)
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean := false;
begin
  -- 대조군: 활성 상태의 강사B는 자기 폴더에 올릴 수 있다
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name, owner)
  values ('avatars', 'a0000000-0000-4000-8000-00000000000b/me.jpg', 'a0000000-0000-4000-8000-00000000000b');

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('avatars', 'a0000000-0000-4000-8000-00000000000a/me.jpg', 'a0000000-0000-4000-8000-00000000000a');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;

  if not v_blocked then
    raise exception 'banned_cannot_upload_avatar 실패';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- has_requirements_tour: 센터C가 사업자등록증만 확인됐을 때 post_tour는 false,
--                        여행업 등록증까지 확인되면 true. 센터C 본인이 물어본다.
--                        다른 사용자(강사B)가 센터C 요건을 물어보면 거부.
-- ---------------------------------------------------------------------
do $$
declare
  v_tour boolean;
  v_lesson boolean;
  v_blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  insert into public.documents (id, owner_id, doc_type, file_path) values
    ('d0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-00000000000c',
     'business_registration', 'a0000000-0000-4000-8000-00000000000c/biz.jpg'),
    ('d0000000-0000-4000-8000-0000000000c2', 'a0000000-0000-4000-8000-00000000000c',
     'travel_business', 'a0000000-0000-4000-8000-00000000000c/travel.jpg');

  -- 확인 전: 수업 공고도 안 됨
  if public.has_requirements('a0000000-0000-4000-8000-00000000000c', 'post_lesson') then
    raise exception 'has_requirements_tour 실패 (확인 전 post_lesson이 true)';
  end if;

  -- 관리자: 사업자등록증만 확인
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  perform public.review_document('d0000000-0000-4000-8000-0000000000c1', 'verified', null, null);

  -- 센터C 본인
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  v_tour := public.has_requirements('a0000000-0000-4000-8000-00000000000c', 'post_tour');
  v_lesson := public.has_requirements('a0000000-0000-4000-8000-00000000000c', 'post_lesson');
  if v_tour or not v_lesson then
    raise exception 'has_requirements_tour 실패 (사업자만: post_tour %, post_lesson %)', v_tour, v_lesson;
  end if;

  -- 강사B가 센터C 요건을 물어보면 거부
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, true);
  begin
    perform public.has_requirements('a0000000-0000-4000-8000-00000000000c', 'post_tour');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'has_requirements_tour 실패 (다른 사용자가 센터C 요건을 조회함)';
  end if;

  -- 관리자: 여행업 등록증 확인
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  perform public.review_document('d0000000-0000-4000-8000-0000000000c2', 'verified', null, null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  v_tour := public.has_requirements('a0000000-0000-4000-8000-00000000000c', 'post_tour');
  if not v_tour then
    raise exception 'has_requirements_tour 실패 (여행업까지 확인 후 post_tour false)';
  end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- id_original_kept_for_purge: 신분증을 확인해도 RPC는 file_path를 지우지 않는다
--   (원본 삭제와 경로 비우기는 /api/admin/purge-original이 service role로 한다)
-- ---------------------------------------------------------------------
do $$
declare
  v_path text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  insert into public.documents (id, owner_id, doc_type, file_path)
  values ('d0000000-0000-4000-8000-0000000000c3', 'a0000000-0000-4000-8000-00000000000c',
          'representative_id', 'a0000000-0000-4000-8000-00000000000c/rep-id.jpg');

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  perform public.review_document('d0000000-0000-4000-8000-0000000000c3', 'verified', null, null);
  reset role;

  select file_path into v_path from public.documents where id = 'd0000000-0000-4000-8000-0000000000c3';
  if v_path is distinct from 'a0000000-0000-4000-8000-00000000000c/rep-id.jpg' then
    raise exception 'id_original_kept_for_purge 실패 (file_path %)', v_path;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- future_submitted_at_blocked: 미래 제출 시각으로 '최신 서류' 자리를 잡을 수 없다
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, true);
  begin
    insert into public.documents (owner_id, doc_type, file_path, submitted_at)
    values ('a0000000-0000-4000-8000-00000000000b', 'first_aid',
            'a0000000-0000-4000-8000-00000000000b/cpr.jpg', now() + interval '1 day');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;

  if not v_blocked then
    raise exception 'future_submitted_at_blocked 실패';
  end if;
end $$;

rollback;

select 'phase1 ok' as result;
