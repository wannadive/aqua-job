-- =====================================================================
-- 아쿠아잡 2단계 전 정비 검사 (개발/테스트 전용) — 004 적용 후 실행
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다.
-- 성공하면 마지막에 'pre2 ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자. auth.users에 넣으면 가입 트리거가 돈다.
--   P = e2000000-0000-4000-8000-0000000000a1 (강사, 공개 프로필)
--   Q = e2000000-0000-4000-8000-0000000000a2 (강사, 비공개 프로필)
--   R = e2000000-0000-4000-8000-0000000000a3 (강사, 프로필 아직 없음)
--   C = e2000000-0000-4000-8000-0000000000c1 (센터)
--   D = e2000000-0000-4000-8000-0000000000d1 (관리자)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'pre2-p@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사P","phone":"010-1000-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'pre2-q@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사Q","phone":"010-1000-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-0000000000a3',
   'authenticated', 'authenticated', 'pre2-r@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사R","phone":"010-1000-0003"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'pre2-c@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"센터C","phone":"010-1000-0004"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'pre2-d@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"관리자D"}', now(), now());

-- 관리자 지정은 운영과 같은 방식(postgres 세션의 update)으로 한다.
update public.profiles set role = 'admin' where id = 'e2000000-0000-4000-8000-0000000000d1';

-- 강사 프로필: P는 공개, Q는 비공개, R은 아직 없음(postgres라 RLS를 거치지 않고 넣는다)
insert into public.talent_profiles (user_id, is_public) values
  ('e2000000-0000-4000-8000-0000000000a1', true),
  ('e2000000-0000-4000-8000-0000000000a2', false);

-- ---------------------------------------------------------------------
-- instructor_cannot_list_other_instructors: 강사는 다른 강사의 profiles 행(이름)을 볼 수 없다
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);

  -- 대조군: 본인은 1행
  select count(*) into n from public.profiles where id = 'e2000000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'instructor_cannot_list_other_instructors 실패 (본인 %행)', n; end if;

  select count(*) into n from public.profiles
    where id in ('e2000000-0000-4000-8000-0000000000a2', 'e2000000-0000-4000-8000-0000000000a3');
  if n <> 0 then raise exception 'instructor_cannot_list_other_instructors 실패 (강사P가 다른 강사 %행 봄)', n; end if;

  -- 공개 프로필 강사라도 다른 강사에게는 안 보인다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles where id = 'e2000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'instructor_cannot_list_other_instructors 실패 (강사R이 공개 강사P를 봄)'; end if;

  -- 대조군: 관리자는 전부 본다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles
    where id in ('e2000000-0000-4000-8000-0000000000a1', 'e2000000-0000-4000-8000-0000000000a2',
                 'e2000000-0000-4000-8000-0000000000a3', 'e2000000-0000-4000-8000-0000000000c1');
  if n <> 4 then raise exception 'instructor_cannot_list_other_instructors 실패 (관리자 %행)', n; end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- center_sees_public_instructor_name: 센터는 공개 프로필 강사의 이름을 본다
-- ---------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select display_name into v_name from public.profiles where id = 'e2000000-0000-4000-8000-0000000000a1';
  reset role;

  if v_name is distinct from '강사P' then
    raise exception 'center_sees_public_instructor_name 실패 (이름 %)', v_name;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- center_cannot_see_private_instructor_name: 비공개 강사·프로필 없는 강사의 이름은 센터도 못 본다
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles
    where id in ('e2000000-0000-4000-8000-0000000000a2', 'e2000000-0000-4000-8000-0000000000a3');
  reset role;

  if n <> 0 then
    raise exception 'center_cannot_see_private_instructor_name 실패 (센터C가 %행 봄)', n;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- everyone_sees_center_name: 로그인한 누구나(강사, 프로필 없는 강사 포함) 센터 이름을 본다
-- ---------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  select display_name into v_name from public.profiles where id = 'e2000000-0000-4000-8000-0000000000c1';
  if v_name is distinct from '센터C' then
    raise exception 'everyone_sees_center_name 실패 (강사Q가 본 이름 %)', v_name;
  end if;

  v_name := null;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text, true);
  select display_name into v_name from public.profiles where id = 'e2000000-0000-4000-8000-0000000000c1';
  if v_name is distinct from '센터C' then
    raise exception 'everyone_sees_center_name 실패 (강사R이 본 이름 %)', v_name;
  end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- has_requirements_uses_latest_verified:
--   사업자등록증 확인 → post_lesson true
--   새로 낸 사업자등록증이 대기 중이어도 true, 그 새 서류가 반려돼도 true
--   유효기간 있는 서류: 오늘까지면 true, 어제 만료면 false
--   (유효기간 서류를 요구하는 규칙이 아직 없어 검사용 규칙 pre2_test를 잠깐 넣는다 — rollback으로 사라진다)
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  insert into public.verification_documents (id, owner_id, doc_type, file_path)
  values ('d2000000-0000-4000-8000-0000000000b1', 'e2000000-0000-4000-8000-0000000000c1',
          'business_registration', 'e2000000-0000-4000-8000-0000000000c1/biz1.jpg');

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('d2000000-0000-4000-8000-0000000000b1', 'verified', null, null);
  reset role;

  -- 같은 트랜잭션 안이라 now()가 같으므로, 첫 서류를 하루 앞으로 옮겨 순서를 만든다
  update public.verification_documents
    set submitted_at = now() - interval '1 day', verified_at = now() - interval '1 day'
  where id = 'd2000000-0000-4000-8000-0000000000b1';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_ok := public.has_requirements('e2000000-0000-4000-8000-0000000000c1', 'post_lesson');
  if not v_ok then raise exception 'has_requirements_uses_latest_verified 실패 (확인 후 false)'; end if;

  -- 새 사업자등록증 제출(대기 중)
  insert into public.verification_documents (id, owner_id, doc_type, file_path)
  values ('d2000000-0000-4000-8000-0000000000b2', 'e2000000-0000-4000-8000-0000000000c1',
          'business_registration', 'e2000000-0000-4000-8000-0000000000c1/biz2.jpg');
  v_ok := public.has_requirements('e2000000-0000-4000-8000-0000000000c1', 'post_lesson');
  if not v_ok then raise exception 'has_requirements_uses_latest_verified 실패 (새 서류 대기 중 false)'; end if;

  -- 새 서류 반려
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('d2000000-0000-4000-8000-0000000000b2', 'rejected', null, '사진이 흐려요');

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_ok := public.has_requirements('e2000000-0000-4000-8000-0000000000c1', 'post_lesson');
  if not v_ok then raise exception 'has_requirements_uses_latest_verified 실패 (새 서류 반려 후 false)'; end if;

  -- 유효기간 있는 서류(대표강사 자격증)
  insert into public.verification_documents (id, owner_id, doc_type, file_path)
  values ('d2000000-0000-4000-8000-0000000000b3', 'e2000000-0000-4000-8000-0000000000c1',
          'rep_instructor_cert', 'e2000000-0000-4000-8000-0000000000c1/rep-cert.jpg');
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('d2000000-0000-4000-8000-0000000000b3', 'verified', date '2099-12-31', null);
  reset role;

  insert into public.verification_requirements (action, doc_type) values ('pre2_test', 'rep_instructor_cert');

  -- 오늘(KST)까지 유효 → true
  update public.verification_documents set valid_until = (now() at time zone 'Asia/Seoul')::date
  where id = 'd2000000-0000-4000-8000-0000000000b3';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_ok := public.has_requirements('e2000000-0000-4000-8000-0000000000c1', 'pre2_test');
  if not v_ok then raise exception 'has_requirements_uses_latest_verified 실패 (오늘 만료일인데 false)'; end if;
  reset role;

  -- 어제 만료 → false
  update public.verification_documents set valid_until = (now() at time zone 'Asia/Seoul')::date - 1
  where id = 'd2000000-0000-4000-8000-0000000000b3';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_ok := public.has_requirements('e2000000-0000-4000-8000-0000000000c1', 'pre2_test');
  if v_ok then raise exception 'has_requirements_uses_latest_verified 실패 (만료됐는데 true)'; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- effective_doc_respects_rls: effective_doc를 직접 불러도 남의 서류 행은 나오지 않는다
--   (센터C의 사업자등록증은 위 검사에서 확인됨)
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  set local role authenticated;

  -- 대조군: 본인은 유효 서류를 받는다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_id := (public.effective_doc('e2000000-0000-4000-8000-0000000000c1', 'business_registration')).id;
  if v_id is distinct from 'd2000000-0000-4000-8000-0000000000b1' then
    raise exception 'effective_doc_respects_rls 실패 (본인 결과 %)', v_id;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_id := (public.effective_doc('e2000000-0000-4000-8000-0000000000c1', 'business_registration')).id;
  if v_id is not null then
    raise exception 'effective_doc_respects_rls 실패 (강사P가 센터C 서류를 받음)';
  end if;

  reset role;
end $$;

rollback;

select 'pre2 ok' as result;
