-- =====================================================================
-- 아쿠아잡 008 유료 전환 전 보안 정리 검사 (개발/테스트 전용) — 008 적용 후 실행
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다.
-- 성공하면 마지막에 'pre3 ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
--
-- 검사 사이에 만든 공고·지원 id는 트랜잭션 설정값(p3p.*)에 담아 넘긴다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자. auth.users에 넣으면 가입 트리거가 돈다(→ 센터는 centers 행, 연락처 행도 생긴다).
--   C1 = f8000000-0000-4000-8000-0000000000c1 (센터, 사업자등록증 확인)
--   I1 = f8000000-0000-4000-8000-0000000000a1 (강사, 공개 이력서, 강사 자격증 확인, C1 공고에 지원)
--   I2 = f8000000-0000-4000-8000-0000000000a2 (강사, 이력서 없음 — 보는 사람)
--   M  = f8000000-0000-4000-8000-0000000000b1 (센터 + 강사 겸용, 비공개 이력서,
--        사업자등록증·강사 자격증 확인, 아무 공고에도 지원하지 않음)
--   M2 = f8000000-0000-4000-8000-0000000000b2 (센터 + 강사 겸용, 공개 이력서, 사업자등록증·강사 자격증 확인)
--   A  = f8000000-0000-4000-8000-0000000000d1 (관리자 + 강사 + 센터)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'p3p-c1@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"정리센터1","phone":"010-8000-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'p3p-i1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"정리강사1","phone":"010-8000-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'p3p-i2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"정리강사2","phone":"010-8000-0003"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-4000-8000-0000000000b1',
   'authenticated', 'authenticated', 'p3p-m@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"겸용센터M","phone":"010-8000-0004"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-4000-8000-0000000000b2',
   'authenticated', 'authenticated', 'p3p-m2@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"겸용센터M2","phone":"010-8000-0005"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'p3p-d@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"정리관리자"}', now(), now());

-- 여러 역할·관리자 지정은 운영과 같은 방식(postgres 세션의 update)으로 한다.
update public.profiles set roles = array['center', 'instructor'], role = 'center'
  where id in ('f8000000-0000-4000-8000-0000000000b1', 'f8000000-0000-4000-8000-0000000000b2');
update public.profiles set roles = array['admin', 'instructor', 'center'], role = 'admin'
  where id = 'f8000000-0000-4000-8000-0000000000d1';

-- 무료 기간에서 시작한다(운영 값이 무엇이든 이 트랜잭션 안에서만)
update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

insert into public.talent_profiles (user_id, is_public) values
  ('f8000000-0000-4000-8000-0000000000a1', true),
  ('f8000000-0000-4000-8000-0000000000b1', false),
  ('f8000000-0000-4000-8000-0000000000b2', true);

insert into public.verification_documents (id, owner_id, doc_type, file_path, meta) values
  ('f8d00000-0000-4000-8000-0000000000c1', 'f8000000-0000-4000-8000-0000000000c1',
   'business_registration', 'f8000000-0000-4000-8000-0000000000c1/biz.jpg', '{}'),
  ('f8d00000-0000-4000-8000-0000000000a1', 'f8000000-0000-4000-8000-0000000000a1',
   'instructor_cert', 'f8000000-0000-4000-8000-0000000000a1/cert.jpg', '{"org":"AIDA","grade":"Instructor"}'),
  ('f8d00000-0000-4000-8000-0000000000b1', 'f8000000-0000-4000-8000-0000000000b1',
   'business_registration', 'f8000000-0000-4000-8000-0000000000b1/biz.jpg', '{}'),
  ('f8d00000-0000-4000-8000-0000000000b2', 'f8000000-0000-4000-8000-0000000000b1',
   'instructor_cert', 'f8000000-0000-4000-8000-0000000000b1/cert.jpg', '{"org":"AIDA","grade":"Master"}'),
  ('f8d00000-0000-4000-8000-0000000000e1', 'f8000000-0000-4000-8000-0000000000b2',
   'business_registration', 'f8000000-0000-4000-8000-0000000000b2/biz.jpg', '{}'),
  ('f8d00000-0000-4000-8000-0000000000e2', 'f8000000-0000-4000-8000-0000000000b2',
   'instructor_cert', 'f8000000-0000-4000-8000-0000000000b2/cert.jpg', '{"org":"AIDA","grade":"Instructor"}');

-- 서류 확인 → 공고·지원 준비
--   p3p.j1 = C1 수업 공고, p3p.app = I1 → J1 (지원함)
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_id uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('f8d00000-0000-4000-8000-0000000000c1', 'verified', null, null);
  perform public.review_document('f8d00000-0000-4000-8000-0000000000a1', 'verified', v_today + 365, null);
  perform public.review_document('f8d00000-0000-4000-8000-0000000000b1', 'verified', null, null);
  perform public.review_document('f8d00000-0000-4000-8000-0000000000b2', 'verified', v_today + 365, null);
  perform public.review_document('f8d00000-0000-4000-8000-0000000000e1', 'verified', null, null);
  perform public.review_document('f8d00000-0000-4000-8000-0000000000e2', 'verified', v_today + 365, null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_id := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '정리 수업 공고', 'region', '서울',
    'class_date', v_today + 10, 'headcount', 2, 'description', '정리 설명', 'deadline', v_today + 9));
  perform set_config('p3p.j1', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_id := public.apply_to_job(current_setting('p3p.j1')::uuid, '지원합니다');
  perform set_config('p3p.app', v_id::text, true);
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- unsubscribed_center_cannot_list_applications:
--   대조군: 무료 기간에 C1은 자기 공고 지원 1행을 직접 조회로 본다.
--   유료 전환(paid_mode=true) 뒤 구독 없는 C1은 0행. 지원한 강사 I1 본인은 계속 1행.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications where job_id = current_setting('p3p.j1')::uuid;
  if n <> 1 then raise exception 'unsubscribed_center_cannot_list_applications 실패 (무료 기간 주인 %행)', n; end if;
  reset role;

  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications where job_id = current_setting('p3p.j1')::uuid;
  if n <> 0 then raise exception 'unsubscribed_center_cannot_list_applications 실패 (구독 없는 주인 %행)', n; end if;
  -- 이름 조인(listApplicants와 같은 모양)으로도 아무것도 안 나온다
  select count(*) into n from public.job_applications a
    join public.profiles p on p.id = a.instructor_id
    where a.job_id = current_setting('p3p.j1')::uuid;
  if n <> 0 then raise exception 'unsubscribed_center_cannot_list_applications 실패 (구독 없는 주인 이름 조인 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications where id = current_setting('p3p.app')::uuid;
  if n <> 1 then raise exception 'unsubscribed_center_cannot_list_applications 실패 (지원한 강사 본인 %행)', n; end if;
  reset role;

  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';
end $$;

-- ---------------------------------------------------------------------
-- instructor_facts_need_center_subscription:
--   대조군: 무료 기간에 C1은 지원자 I1의 이름·이력서·강사 서류 사실(강사 자격증 1행)을 본다.
--   유료 전환 뒤 구독 없는 C1은 강사 서류 사실 0행, 이름 0행, 이력서 0행(can_view_profile false).
--   I1 본인은 유료 전환 뒤에도 자기 서류 사실을 본다. 비로그인은 언제나 강사 서류 사실 0행.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_type text;
  v_ok boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select f.doc_type into v_type from public.get_public_facts('f8000000-0000-4000-8000-0000000000a1') f;
  if v_type is distinct from 'instructor_cert' then
    raise exception 'instructor_facts_need_center_subscription 실패 (무료 기간 센터 서류 사실 %)', v_type;
  end if;
  select count(*) into n from public.profiles where id = 'f8000000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'instructor_facts_need_center_subscription 실패 (무료 기간 센터 이름 %행)', n; end if;
  select count(*) into n from public.talent_profiles where user_id = 'f8000000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'instructor_facts_need_center_subscription 실패 (무료 기간 센터 이력서 %행)', n; end if;
  reset role;

  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_public_facts('f8000000-0000-4000-8000-0000000000a1');
  if n <> 0 then raise exception 'instructor_facts_need_center_subscription 실패 (구독 없는 센터 서류 사실 %행)', n; end if;
  select count(*) into n from public.profiles where id = 'f8000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'instructor_facts_need_center_subscription 실패 (구독 없는 센터 이름 %행)', n; end if;
  select count(*) into n from public.talent_profiles where user_id = 'f8000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'instructor_facts_need_center_subscription 실패 (구독 없는 센터 이력서 %행)', n; end if;
  v_ok := public.can_view_profile('f8000000-0000-4000-8000-0000000000a1');
  if v_ok then raise exception 'instructor_facts_need_center_subscription 실패 (구독 없는 센터 can_view_profile)'; end if;
  -- 센터 이름은 구독과 상관없이 보인다(대조군: 강사 I1이 C1 이름을 본다)
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles where id = 'f8000000-0000-4000-8000-0000000000c1';
  if n <> 1 then raise exception 'instructor_facts_need_center_subscription 실패 (강사가 센터 이름 %행)', n; end if;
  -- 본인은 자기 서류 사실을 본다
  select count(*) into n from public.get_public_facts('f8000000-0000-4000-8000-0000000000a1');
  if n <> 1 then raise exception 'instructor_facts_need_center_subscription 실패 (본인 서류 사실 %행)', n; end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into n from public.get_public_facts('f8000000-0000-4000-8000-0000000000a1');
  reset role;
  if n <> 0 then raise exception 'instructor_facts_need_center_subscription 실패 (비로그인 강사 서류 사실 %행)', n; end if;

  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';
end $$;

-- ---------------------------------------------------------------------
-- multi_role_center_does_not_expose_instructor_facts: 겸용(센터+강사) 계정 M(비공개 이력서, 지원 없음)
--   강사 I2: M의 이름(센터 이름)은 보지만, 서류 사실은 센터 서류(사업자등록증)만, 이력서 0행.
--   센터 C1(무료 기간 = 구독 중): 역시 센터 서류만, 이력서 0행(공개도 아니고 지원자도 아니다).
--   비로그인: 센터 서류만. 본인 M: 둘 다(2행).
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_types text[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles where id = 'f8000000-0000-4000-8000-0000000000b1';
  if n <> 1 then raise exception 'multi_role_center_does_not_expose_instructor_facts 실패 (강사가 센터 이름 %행)', n; end if;
  select array_agg(f.doc_type order by f.doc_type) into v_types
    from public.get_public_facts('f8000000-0000-4000-8000-0000000000b1') f;
  if v_types is distinct from array['business_registration']::text[] then
    raise exception 'multi_role_center_does_not_expose_instructor_facts 실패 (강사가 받은 사실 %)', v_types;
  end if;
  select count(*) into n from public.talent_profiles where user_id = 'f8000000-0000-4000-8000-0000000000b1';
  if n <> 0 then raise exception 'multi_role_center_does_not_expose_instructor_facts 실패 (강사가 이력서 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select array_agg(f.doc_type order by f.doc_type) into v_types
    from public.get_public_facts('f8000000-0000-4000-8000-0000000000b1') f;
  if v_types is distinct from array['business_registration']::text[] then
    raise exception 'multi_role_center_does_not_expose_instructor_facts 실패 (센터가 받은 사실 %)', v_types;
  end if;
  select count(*) into n from public.talent_profiles where user_id = 'f8000000-0000-4000-8000-0000000000b1';
  if n <> 0 then raise exception 'multi_role_center_does_not_expose_instructor_facts 실패 (센터가 이력서 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000b1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_public_facts('f8000000-0000-4000-8000-0000000000b1');
  if n <> 2 then raise exception 'multi_role_center_does_not_expose_instructor_facts 실패 (본인 %행)', n; end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select array_agg(f.doc_type order by f.doc_type) into v_types
    from public.get_public_facts('f8000000-0000-4000-8000-0000000000b1') f;
  reset role;
  if v_types is distinct from array['business_registration']::text[] then
    raise exception 'multi_role_center_does_not_expose_instructor_facts 실패 (비로그인이 받은 사실 %)', v_types;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- multi_role_public_resume_needs_subscription: 겸용 계정 M2(공개 이력서)
--   대조군: 무료 기간(= 구독 중) C1은 M2 이력서 1행, 서류 사실 2행(사업자등록증·강사 자격증).
--   유료 전환 뒤 구독 없는 C1은 M2 이름(센터 이름)은 1행이지만 이력서 0행, 서류 사실은 사업자등록증만.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_types text[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.talent_profiles where user_id = 'f8000000-0000-4000-8000-0000000000b2';
  if n <> 1 then raise exception 'multi_role_public_resume_needs_subscription 실패 (무료 기간 이력서 %행)', n; end if;
  select array_agg(f.doc_type order by f.doc_type) into v_types
    from public.get_public_facts('f8000000-0000-4000-8000-0000000000b2') f;
  if v_types is distinct from array['business_registration', 'instructor_cert']::text[] then
    raise exception 'multi_role_public_resume_needs_subscription 실패 (무료 기간 사실 %)', v_types;
  end if;
  reset role;

  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles where id = 'f8000000-0000-4000-8000-0000000000b2';
  if n <> 1 then raise exception 'multi_role_public_resume_needs_subscription 실패 (구독 없는 센터가 본 이름 %행)', n; end if;
  select count(*) into n from public.talent_profiles where user_id = 'f8000000-0000-4000-8000-0000000000b2';
  if n <> 0 then raise exception 'multi_role_public_resume_needs_subscription 실패 (구독 없는 센터 이력서 %행)', n; end if;
  select array_agg(f.doc_type order by f.doc_type) into v_types
    from public.get_public_facts('f8000000-0000-4000-8000-0000000000b2') f;
  if v_types is distinct from array['business_registration']::text[] then
    raise exception 'multi_role_public_resume_needs_subscription 실패 (구독 없는 센터 사실 %)', v_types;
  end if;
  reset role;

  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';
end $$;

-- ---------------------------------------------------------------------
-- banned_owner_cannot_read_own_jobs_directly:
--   대조군: 활성 C1은 job_posts 직접 조회로 자기 공고 1행.
--   C1이 퇴출되면 0행(관리자는 계속 1행). 정지도 같다.
-- inactive_center_name_hidden (같은 블록): 대조군 — 활성 C1의 이름(profiles 행)은 활성 강사 I2가 1행.
--   C1이 정지·퇴출되면 I2는 0행, C1 본인·관리자는 1행.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_status text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where id = current_setting('p3p.j1')::uuid;
  if n <> 1 then raise exception 'banned_owner_cannot_read_own_jobs_directly 실패 (활성 주인 %행)', n; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles where id = 'f8000000-0000-4000-8000-0000000000c1';
  if n <> 1 then raise exception 'inactive_center_name_hidden 실패 (활성 센터를 강사가 %행)', n; end if;
  reset role;

  foreach v_status in array array['banned', 'suspended'] loop
    update public.profiles set account_status = v_status where id = 'f8000000-0000-4000-8000-0000000000c1';

    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'f8000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
    select count(*) into n from public.job_posts where owner_id = 'f8000000-0000-4000-8000-0000000000c1';
    if n <> 0 then raise exception 'banned_owner_cannot_read_own_jobs_directly 실패 (% 주인 %행)', v_status, n; end if;
    -- 본인은 자기 profiles 행을 계속 본다
    select count(*) into n from public.profiles where id = 'f8000000-0000-4000-8000-0000000000c1';
    if n <> 1 then raise exception 'inactive_center_name_hidden 실패 (% 센터 본인 %행)', v_status, n; end if;

    -- 활성 강사는 정지·퇴출 센터의 이름(profiles 행)을 못 본다
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'f8000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
    select count(*) into n from public.profiles where id = 'f8000000-0000-4000-8000-0000000000c1';
    if n <> 0 then raise exception 'inactive_center_name_hidden 실패 (% 센터를 강사가 %행)', v_status, n; end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', 'f8000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
    select count(*) into n from public.job_posts where id = current_setting('p3p.j1')::uuid;
    if n <> 1 then raise exception 'banned_owner_cannot_read_own_jobs_directly 실패 (% 주인일 때 관리자 %행)', v_status, n; end if;
    select count(*) into n from public.profiles where id = 'f8000000-0000-4000-8000-0000000000c1';
    if n <> 1 then raise exception 'inactive_center_name_hidden 실패 (% 센터를 관리자가 %행)', v_status, n; end if;
    reset role;
  end loop;

  update public.profiles set account_status = 'active' where id = 'f8000000-0000-4000-8000-0000000000c1';
end $$;

-- ---------------------------------------------------------------------
-- admin_unaffected: 유료 전환 뒤에도 관리자 A는 C1 공고·지원, I1·M 이력서,
--   I1의 강사 서류 사실, M의 서류 사실 전부(2행), 강사 이름을 본다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f8000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where id = current_setting('p3p.j1')::uuid;
  if n <> 1 then raise exception 'admin_unaffected 실패 (공고 %행)', n; end if;
  select count(*) into n from public.job_applications where job_id = current_setting('p3p.j1')::uuid;
  if n <> 1 then raise exception 'admin_unaffected 실패 (지원 %행)', n; end if;
  select count(*) into n from public.talent_profiles
    where user_id in ('f8000000-0000-4000-8000-0000000000a1', 'f8000000-0000-4000-8000-0000000000b1');
  if n <> 2 then raise exception 'admin_unaffected 실패 (이력서 %행)', n; end if;
  select count(*) into n from public.get_public_facts('f8000000-0000-4000-8000-0000000000a1');
  if n <> 1 then raise exception 'admin_unaffected 실패 (I1 서류 사실 %행)', n; end if;
  select count(*) into n from public.get_public_facts('f8000000-0000-4000-8000-0000000000b1');
  if n <> 2 then raise exception 'admin_unaffected 실패 (M 서류 사실 %행)', n; end if;
  select count(*) into n from public.profiles
    where id in ('f8000000-0000-4000-8000-0000000000a1', 'f8000000-0000-4000-8000-0000000000a2');
  if n <> 2 then raise exception 'admin_unaffected 실패 (강사 이름 %행)', n; end if;
  reset role;

  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';
end $$;

rollback;

select 'pre3 ok' as result;
