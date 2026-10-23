-- =====================================================================
-- 아쿠아잡 2단계 공고 검사 (개발/테스트 전용) — 005·006 적용 후 실행
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다.
-- 성공하면 마지막에 'jobs ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
--
-- 검사 사이에 만든 공고·지원 id는 트랜잭션 설정값(jobs.*)에 담아 넘긴다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자. auth.users에 넣으면 가입 트리거가 돈다.
--   C1 = f2000000-0000-4000-8000-0000000000c1 (센터, 사업자등록증 확인)
--   C2 = f2000000-0000-4000-8000-0000000000c2 (센터, 사업자등록증 확인 — "다른 센터")
--   C3 = f2000000-0000-4000-8000-0000000000c3 (센터, 서류 없음)
--   C4 = f2000000-0000-4000-8000-0000000000c4 (센터, 사업자등록증 확인 → 뒤에서 퇴출)
--   M  = f2000000-0000-4000-8000-0000000000b1 (센터 + 강사 여러 역할, 사업자등록증 확인)
--   I1 = f2000000-0000-4000-8000-0000000000a1 (강사, 공개 프로필)
--   I2 = f2000000-0000-4000-8000-0000000000a2 (강사, 비공개 프로필, 신분증 확인)
--   I3 = f2000000-0000-4000-8000-0000000000a3 (강사, 퇴출)
--   I4 = f2000000-0000-4000-8000-0000000000a4 (강사)
--   D  = f2000000-0000-4000-8000-0000000000d1 (관리자)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'jobs-c1@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"센터1","phone":"010-2000-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000c2',
   'authenticated', 'authenticated', 'jobs-c2@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"센터2","phone":"010-2000-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000c3',
   'authenticated', 'authenticated', 'jobs-c3@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"센터3","phone":"010-2000-0003"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000c4',
   'authenticated', 'authenticated', 'jobs-c4@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"센터4","phone":"010-2000-0004"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000b1',
   'authenticated', 'authenticated', 'jobs-m@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"겸업M","phone":"010-2000-0005"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'jobs-i1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사1","phone":"010-3000-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'jobs-i2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사2","phone":"010-3000-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000a3',
   'authenticated', 'authenticated', 'jobs-i3@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사3","phone":"010-3000-0003"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000a4',
   'authenticated', 'authenticated', 'jobs-i4@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사4","phone":"010-3000-0004"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'jobs-d@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"관리자D"}', now(), now());

-- 관리자 지정·여러 역할·퇴출은 운영과 같은 방식(postgres 세션의 update)으로 한다.
update public.profiles set role = 'admin' where id = 'f2000000-0000-4000-8000-0000000000d1';
update public.profiles set roles = array['center', 'instructor'], role = 'center'
  where id = 'f2000000-0000-4000-8000-0000000000b1';
update public.profiles set account_status = 'banned' where id = 'f2000000-0000-4000-8000-0000000000a3';

-- 무료 기간에서 시작한다(운영 값이 무엇이든 이 트랜잭션 안에서만)
update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

insert into public.talent_profiles (user_id, is_public) values
  ('f2000000-0000-4000-8000-0000000000a1', true),
  ('f2000000-0000-4000-8000-0000000000a2', false);

insert into public.center_profiles (user_id, center_name, representative_name, address, venues) values
  ('f2000000-0000-4000-8000-0000000000c1', '센터일다이브', '대표일', '서울시 송파구 1', array['잠실 풀']);

-- 센터 공개 RPC는 centers.id(006)로 찾는다. 가입 트리거가 만든 센터 id를 담아 둔다.
do $$
begin
  perform set_config('jobs.center_c1',
    (select c.id::text from public.centers c where c.owner_user_id = 'f2000000-0000-4000-8000-0000000000c1'), true);
  perform set_config('jobs.center_c2',
    (select c.id::text from public.centers c where c.owner_user_id = 'f2000000-0000-4000-8000-0000000000c2'), true);
end $$;

-- 서류(제출 상태로 넣고 아래에서 관리자가 확인한다)
insert into public.verification_documents (id, owner_id, doc_type, file_path, meta) values
  ('f2d00000-0000-4000-8000-0000000000c1', 'f2000000-0000-4000-8000-0000000000c1',
   'business_registration', 'f2000000-0000-4000-8000-0000000000c1/biz.jpg', '{}'),
  ('f2d00000-0000-4000-8000-0000000000c2', 'f2000000-0000-4000-8000-0000000000c2',
   'business_registration', 'f2000000-0000-4000-8000-0000000000c2/biz.jpg', '{}'),
  ('f2d00000-0000-4000-8000-0000000000c4', 'f2000000-0000-4000-8000-0000000000c4',
   'business_registration', 'f2000000-0000-4000-8000-0000000000c4/biz.jpg', '{}'),
  ('f2d00000-0000-4000-8000-0000000000b1', 'f2000000-0000-4000-8000-0000000000b1',
   'business_registration', 'f2000000-0000-4000-8000-0000000000b1/biz.jpg', '{}'),
  ('f2d00000-0000-4000-8000-0000000000a2', 'f2000000-0000-4000-8000-0000000000a2',
   'id_card', 'f2000000-0000-4000-8000-0000000000a2/id.jpg', '{"number":"900101-1234567"}'),
  ('f2d00000-0000-4000-8000-0000000000b2', 'f2000000-0000-4000-8000-0000000000b1',
   'instructor_cert', 'f2000000-0000-4000-8000-0000000000b1/cert.jpg', '{"org":"AIDA","grade":"강사"}');

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('f2d00000-0000-4000-8000-0000000000c1', 'verified', null, null);
  perform public.review_document('f2d00000-0000-4000-8000-0000000000c2', 'verified', null, null);
  perform public.review_document('f2d00000-0000-4000-8000-0000000000c4', 'verified', null, null);
  perform public.review_document('f2d00000-0000-4000-8000-0000000000b1', 'verified', null, null);
  perform public.review_document('f2d00000-0000-4000-8000-0000000000a2', 'verified', null, null);
  perform public.review_document('f2d00000-0000-4000-8000-0000000000b2', 'verified', date '2099-12-31', null);
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- post_requires_business_registration: 서류 없는 센터C3는 공고를 못 올린다. 센터C1은 올린다.
--   jobs.a = C1 수업 공고(인원 3), jobs.h = C1 수업 공고(인원 1)
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_blocked boolean := false;
  v_id uuid;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c3', 'role', 'authenticated')::text, true);
  begin
    perform public.create_job_post(jsonb_build_object(
      'job_type', 'lesson', 'title', '서류 없는 공고', 'region', '서울', 'class_date', v_today + 7,
      'headcount', 1, 'description', '설명', 'deadline', v_today + 6));
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'post_requires_business_registration 실패 (C3가 올림)'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_id := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '풀 세션 보조강사', 'region', '서울', 'venue', '잠실 풀',
    'class_date', v_today + 7, 'start_time', '09:00', 'end_time', '13:00',
    'pay_amount', 120000, 'pay_unit', 'per_class', 'headcount', 3,
    'requirement_tags', jsonb_build_array('레스큐 가능'),
    'description', '상세 설명 A', 'deadline', v_today + 6));
  perform set_config('jobs.a', v_id::text, true);

  v_id := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '인원 1명 공고', 'region', '서울',
    'class_date', v_today + 7, 'headcount', 1, 'description', '상세 설명 H', 'deadline', v_today + 6));
  perform set_config('jobs.h', v_id::text, true);
  reset role;

  select count(*) into n from public.job_posts
    where owner_id = 'f2000000-0000-4000-8000-0000000000c3';
  if n <> 0 then raise exception 'post_requires_business_registration 실패 (C3 공고 %행)', n; end if;

  select count(*) into n from public.job_posts
    where id in (current_setting('jobs.a')::uuid, current_setting('jobs.h')::uuid)
      and owner_id = 'f2000000-0000-4000-8000-0000000000c1' and status = 'open';
  if n <> 2 then raise exception 'post_requires_business_registration 실패 (C1 공고 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- post_tour_requires_travel_business: 사업자등록증만 있는 C1은 투어 공고를 못 올리고,
--   여행업 등록증이 확인되면 올린다. jobs.t = C1 투어 공고
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_tour jsonb := jsonb_build_object(
    'job_type', 'tour', 'title', '보홀 투어 동행 강사', 'region', '해외',
    'tour_start', v_today + 30, 'tour_end', v_today + 34, 'destination', '보홀',
    'destination_kind', 'overseas', 'covers_flight', true, 'covers_lodging', true,
    'headcount', 1, 'description', '투어 설명', 'deadline', v_today + 20);
  v_blocked boolean := false;
  v_id uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  begin
    perform public.create_job_post(v_tour);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'post_tour_requires_travel_business 실패 (여행업 없이 올림)'; end if;

  insert into public.verification_documents (id, owner_id, doc_type, file_path)
  values ('f2d00000-0000-4000-8000-0000000000c9', 'f2000000-0000-4000-8000-0000000000c1',
          'travel_business', 'f2000000-0000-4000-8000-0000000000c1/travel.jpg');

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('f2d00000-0000-4000-8000-0000000000c9', 'verified', null, null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_id := public.create_job_post(v_tour);
  perform set_config('jobs.t', v_id::text, true);

  -- 투어 종료일이 시작일보다 앞이면 거부
  v_blocked := false;
  begin
    perform public.create_job_post(v_tour || jsonb_build_object('tour_end', v_today + 29));
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'post_tour_requires_travel_business 실패 (종료일 < 시작일 통과)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- anon_lists_summary_without_description: 비로그인은 목록·요약을 보지만 상세 설명은 없다.
--   숨김 공고는 목록·요약에 없다. 공고 테이블 직접 조회는 0행 또는 거부.
--   jobs.x = C2 공고(숨김 처리)
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_id uuid;
  n int;
  v_has_desc boolean;
  v_center text;
  v_remaining int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_id := public.create_job_post(jsonb_build_object(
    'job_type', 'affiliation', 'title', '정규 소속 강사', 'region', '부산',
    'work_days', jsonb_build_array('월', '수', '금'), 'work_time', '평일 저녁',
    'headcount', 1, 'description', '숨길 공고 설명', 'deadline', v_today + 14));
  perform set_config('jobs.x', v_id::text, true);
  reset role;

  update public.job_posts set status = 'hidden' where id = v_id;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  select count(*) into n from public.list_public_jobs(null, null, false, 100, 0) s
    where s.id = current_setting('jobs.a')::uuid;
  if n <> 1 then raise exception 'anon_lists_summary_without_description 실패 (목록에 공고A %행)', n; end if;

  select to_jsonb(s) ? 'description', s.center_name, s.remaining
    into v_has_desc, v_center, v_remaining
  from public.list_public_jobs(null, null, false, 100, 0) s
  where s.id = current_setting('jobs.a')::uuid;
  if v_has_desc then raise exception 'anon_lists_summary_without_description 실패 (목록에 상세 설명)'; end if;
  if v_center is distinct from '센터일다이브' then
    raise exception 'anon_lists_summary_without_description 실패 (센터명 %)', v_center;
  end if;
  if v_remaining <> 3 then raise exception 'anon_lists_summary_without_description 실패 (남은 인원 %)', v_remaining; end if;

  select to_jsonb(s) ? 'description' into v_has_desc
  from public.get_job_summary(current_setting('jobs.a')::uuid) s;
  if v_has_desc is distinct from false then
    raise exception 'anon_lists_summary_without_description 실패 (요약 %)', v_has_desc;
  end if;

  -- 숨김 공고는 목록·요약에 없다
  select count(*) into n from public.list_public_jobs(null, null, false, 100, 0) s
    where s.id = current_setting('jobs.x')::uuid;
  if n <> 0 then raise exception 'anon_lists_summary_without_description 실패 (숨김 공고가 목록에)'; end if;
  select count(*) into n from public.get_job_summary(current_setting('jobs.x')::uuid);
  if n <> 0 then raise exception 'anon_lists_summary_without_description 실패 (숨김 공고 요약)'; end if;

  -- 종류 필터
  select count(*) into n from public.list_public_jobs('tour', null, false, 100, 0) s
    where s.job_type <> 'tour';
  if n <> 0 then raise exception 'anon_lists_summary_without_description 실패 (투어 필터에 다른 종류 %행)', n; end if;

  -- 단가 공개만
  select count(*) into n from public.list_public_jobs(null, null, true, 100, 0) s
    where s.pay_amount is null;
  if n <> 0 then raise exception 'anon_lists_summary_without_description 실패 (단가 공개 필터에 협의 %행)', n; end if;

  -- 공고 테이블 직접 조회
  begin
    select count(*) into n from public.job_posts;
  exception when insufficient_privilege then
    n := 0;
  end;
  if n <> 0 then raise exception 'anon_lists_summary_without_description 실패 (job_posts 직접 %행)', n; end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- detail_requires_login: 비로그인은 상세 RPC 거부, 로그인 강사는 상세 설명을 본다.
--   유료 전환(paid_mode=true) 후에는 강사는 거부, 공고 주인은 본다(구독은 3단계).
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean := false;
  v_desc text;
  v_addr text;
begin
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform * from public.get_job_detail(current_setting('jobs.a')::uuid);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'detail_requires_login 실패 (비로그인 상세)'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  select d.description, d.center ->> 'address' into v_desc, v_addr
    from public.get_job_detail(current_setting('jobs.a')::uuid) d;
  reset role;
  if v_desc is distinct from '상세 설명 A' or v_addr is distinct from '서울시 송파구 1' then
    raise exception 'detail_requires_login 실패 (강사 상세 %, %)', v_desc, v_addr;
  end if;

  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform * from public.get_job_detail(current_setting('jobs.a')::uuid);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'detail_requires_login 실패 (유료 전환 후 강사 상세)'; end if;

  v_desc := null;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select d.description into v_desc from public.get_job_detail(current_setting('jobs.a')::uuid) d;
  if v_desc is distinct from '상세 설명 A' then
    raise exception 'detail_requires_login 실패 (유료 전환 후 주인 상세 %)', v_desc;
  end if;
  reset role;

  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';
end $$;

-- ---------------------------------------------------------------------
-- apply_only_instructor_active: 센터 계정·퇴출 강사는 지원 거부, 활성 강사는 지원.
--   같은 공고 두 번 지원은 거부, 한마디 200자 초과 거부. jobs.app_a1 = I1 → 공고A
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean;
  v_id uuid;
  n int;
begin
  set local role authenticated;

  -- 센터 계정
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(current_setting('jobs.a')::uuid, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'apply_only_instructor_active 실패 (센터가 지원)'; end if;

  -- 퇴출 강사
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(current_setting('jobs.a')::uuid, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'apply_only_instructor_active 실패 (퇴출 강사가 지원)'; end if;

  -- 활성 강사
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_id := public.apply_to_job(current_setting('jobs.a')::uuid, '  잘 부탁드립니다  ');
  perform set_config('jobs.app_a1', v_id::text, true);

  -- 두 번째 지원
  v_blocked := false;
  begin
    perform public.apply_to_job(current_setting('jobs.a')::uuid, null);
  exception when unique_violation then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'apply_only_instructor_active 실패 (중복 지원)'; end if;

  -- 한마디 200자 초과
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(current_setting('jobs.a')::uuid, repeat('가', 201));
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'apply_only_instructor_active 실패 (201자 한마디)'; end if;
  reset role;

  select count(*) into n from public.job_applications
    where job_id = current_setting('jobs.a')::uuid;
  if n <> 1 then raise exception 'apply_only_instructor_active 실패 (공고A 지원 %행)', n; end if;

  select count(*) into n from public.job_applications
    where id = current_setting('jobs.app_a1')::uuid and status = 'applied' and message = '잘 부탁드립니다';
  if n <> 1 then raise exception 'apply_only_instructor_active 실패 (지원 행 상태·한마디)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- cannot_apply_own_job: 센터+강사 계정 M은 자기 공고에 지원할 수 없다(남의 공고에는 된다)
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_job uuid;
  v_blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000b1', 'role', 'authenticated')::text, true);
  v_job := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '내 공고', 'region', '서울', 'class_date', v_today + 5,
    'headcount', 1, 'description', 'M 공고', 'deadline', v_today + 4));

  begin
    perform public.apply_to_job(v_job, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'cannot_apply_own_job 실패 (자기 공고 지원)'; end if;

  -- 대조군: 남의 공고(C1 투어)에는 지원된다
  perform public.apply_to_job(current_setting('jobs.t')::uuid, null);
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- withdraw_only_before_selected: 선택된 지원은 취소 불가, 남의 지원 취소 불가,
--   '지원함'은 취소 가능, 취소 뒤 다시 지원하면 같은 행이 '지원함'으로 되살아난다.
--   공고A(인원 3): I1 선택, I2 지원함, I4 취소 후 재지원(지원함)
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_blocked boolean;
  v_status text;
begin
  set local role authenticated;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  v_id := public.apply_to_job(current_setting('jobs.a')::uuid, null);
  perform set_config('jobs.app_a2', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  v_id := public.apply_to_job(current_setting('jobs.a')::uuid, null);
  perform set_config('jobs.app_a4', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.select_applicant(current_setting('jobs.app_a1')::uuid);

  -- 선택된 I1은 취소 불가
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.withdraw_application(current_setting('jobs.app_a1')::uuid);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'withdraw_only_before_selected 실패 (선택 후 취소)'; end if;

  -- 남의 지원(I2) 취소 불가
  v_blocked := false;
  begin
    perform public.withdraw_application(current_setting('jobs.app_a2')::uuid);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'withdraw_only_before_selected 실패 (남의 지원 취소)'; end if;

  -- I4 취소
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  perform public.withdraw_application(current_setting('jobs.app_a4')::uuid);
  reset role;

  select status into v_status from public.job_applications where id = current_setting('jobs.app_a4')::uuid;
  if v_status <> 'withdrawn' then raise exception 'withdraw_only_before_selected 실패 (취소 후 %)', v_status; end if;
  select status into v_status from public.job_applications where id = current_setting('jobs.app_a1')::uuid;
  if v_status <> 'selected' then raise exception 'withdraw_only_before_selected 실패 (I1 %)', v_status; end if;

  -- I4 재지원 → 같은 행이 되살아난다
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  v_id := public.apply_to_job(current_setting('jobs.a')::uuid, '다시 지원해요');
  reset role;
  if v_id <> current_setting('jobs.app_a4')::uuid then
    raise exception 'withdraw_only_before_selected 실패 (재지원 새 행)';
  end if;
  select status into v_status from public.job_applications where id = v_id;
  if v_status <> 'applied' then raise exception 'withdraw_only_before_selected 실패 (재지원 후 %)', v_status; end if;
end $$;

-- ---------------------------------------------------------------------
-- select_respects_headcount: 인원 1 공고H에 I1·I2 지원 → I1 선택, I2 선택 거부,
--   공고 closed/full, I2는 not_selected, 새 지원 거부. 남의 공고 지원자는 선택 불가.
-- ---------------------------------------------------------------------
do $$
declare
  v_h1 uuid;
  v_h2 uuid;
  v_blocked boolean;
  v_status text;
  v_reason text;
  v_eff text;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_h1 := public.apply_to_job(current_setting('jobs.h')::uuid, null);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  v_h2 := public.apply_to_job(current_setting('jobs.h')::uuid, null);

  -- 다른 센터는 선택 불가
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.select_applicant(v_h1);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'select_respects_headcount 실패 (다른 센터가 선택)'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.select_applicant(v_h1);

  v_blocked := false;
  begin
    perform public.select_applicant(v_h2);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'select_respects_headcount 실패 (인원 초과 선택)'; end if;

  -- 마감된 공고에 새 지원
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(current_setting('jobs.h')::uuid, null);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'select_respects_headcount 실패 (마감 공고에 지원)'; end if;
  reset role;

  select count(*) into n from public.job_applications
    where job_id = current_setting('jobs.h')::uuid and status = 'selected';
  if n <> 1 then raise exception 'select_respects_headcount 실패 (선택 %명)', n; end if;

  select j.status, j.closed_reason, public.job_effective_status(j) into v_status, v_reason, v_eff
    from public.job_posts j where j.id = current_setting('jobs.h')::uuid;
  if v_status <> 'closed' or v_reason <> 'full' or v_eff <> 'full' then
    raise exception 'select_respects_headcount 실패 (공고 % / % / %)', v_status, v_reason, v_eff;
  end if;

  select status into v_status from public.job_applications where id = v_h2;
  if v_status <> 'not_selected' then raise exception 'select_respects_headcount 실패 (I2 %)', v_status; end if;

  -- 잠금 안의 선택 수 검사까지 닿게: 자동 마감을 되돌려 "저장 상태 open + 선택 1명 = 인원 1"을 직접 만든다
  -- (동시에 두 선택이 들어와 둘째가 잠금을 기다린 뒤 보게 되는 상태와 같다)
  update public.job_posts set status = 'open', closed_reason = null where id = current_setting('jobs.h')::uuid;
  update public.job_applications set status = 'applied', decided_at = null where id = v_h2;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.select_applicant(v_h2);
  exception when invalid_parameter_value then
    v_blocked := sqlerrm like '%인원%';
  end;
  reset role;
  if not v_blocked then raise exception 'select_respects_headcount 실패 (잠금 안 인원 검사 미도달)'; end if;

  select count(*) into n from public.job_applications
    where job_id = current_setting('jobs.h')::uuid and status = 'selected';
  if n <> 1 then raise exception 'select_respects_headcount 실패 (인원 검사 후 선택 %명)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- contact_only_for_selected_own_job: 공고 주인 C1이 선택한 I1의 연락처만 1행.
--   선택 안 한 지원자(I2)·다른 센터(C2)·지원자 본인 요청·비로그인은 빈 결과(비로그인은 거부도 통과).
--   private_contacts 직접 조회는 여전히 0행.
-- ---------------------------------------------------------------------
do $$
declare
  v_phone text;
  v_email text;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select c.phone, c.email into v_phone, v_email
    from public.get_applicant_contact(current_setting('jobs.app_a1')::uuid) c;
  if v_phone is distinct from '010-3000-0001' or v_email is distinct from 'jobs-i1@aquajob.test' then
    raise exception 'contact_only_for_selected_own_job 실패 (주인이 선택한 지원자 연락처 %, %)', v_phone, v_email;
  end if;

  select count(*) into n from public.get_applicant_contact(current_setting('jobs.app_a2')::uuid);
  if n <> 0 then raise exception 'contact_only_for_selected_own_job 실패 (선택 안 한 지원자 %행)', n; end if;

  select count(*) into n from public.private_contacts
    where user_id = 'f2000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'contact_only_for_selected_own_job 실패 (private_contacts 직접 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_applicant_contact(current_setting('jobs.app_a1')::uuid);
  if n <> 0 then raise exception 'contact_only_for_selected_own_job 실패 (다른 센터 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_applicant_contact(current_setting('jobs.app_a1')::uuid);
  if n <> 0 then raise exception 'contact_only_for_selected_own_job 실패 (다른 강사 %행)', n; end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    select count(*) into n from public.get_applicant_contact(current_setting('jobs.app_a1')::uuid);
  exception when insufficient_privilege then
    n := 0;
  end;
  reset role;
  if n <> 0 then raise exception 'contact_only_for_selected_own_job 실패 (비로그인 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- anon_cannot_read_applications: 비로그인은 지원 0행(또는 거부), 다른 강사·다른 센터도 0행.
--   대조군: 공고 주인은 자기 공고 지원을 본다. 조회 기록(job_views)은 누구도 직접 못 읽는다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    select count(*) into n from public.job_applications;
  exception when insufficient_privilege then
    n := 0;
  end;
  if n <> 0 then raise exception 'anon_cannot_read_applications 실패 (비로그인 %행)', n; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications
    where instructor_id = 'f2000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'anon_cannot_read_applications 실패 (다른 강사 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications where job_id = current_setting('jobs.a')::uuid;
  if n <> 0 then raise exception 'anon_cannot_read_applications 실패 (다른 센터 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications where job_id = current_setting('jobs.a')::uuid;
  if n <> 3 then raise exception 'anon_cannot_read_applications 실패 (주인 %행)', n; end if;

  begin
    select count(*) into n from public.job_views;
  exception when insufficient_privilege then
    n := 0;
  end;
  if n <> 0 then raise exception 'anon_cannot_read_applications 실패 (job_views 직접 %행)', n; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- view_dedupe_and_owner_excluded: 같은 기기·같은 사람은 하루 1회, 공고 주인은 세지 않는다.
--   기기 키 형식이 틀리면 거부.
-- ---------------------------------------------------------------------
do $$
declare
  v_before int;
  v_after int;
  v_blocked boolean := false;
begin
  select view_count into v_before from public.job_posts where id = current_setting('jobs.a')::uuid;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform public.record_job_view(current_setting('jobs.a')::uuid, 'devkey_ABCDEFGH12345');
  perform public.record_job_view(current_setting('jobs.a')::uuid, 'devkey_ABCDEFGH12345');
  begin
    perform public.record_job_view(current_setting('jobs.a')::uuid, 'bad key!');
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'view_dedupe_and_owner_excluded 실패 (잘못된 기기 키 통과)'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  perform public.record_job_view(current_setting('jobs.a')::uuid, null);
  perform public.record_job_view(current_setting('jobs.a')::uuid, 'devkey_ABCDEFGH12345');

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.record_job_view(current_setting('jobs.a')::uuid, null);
  perform public.record_job_view(current_setting('jobs.a')::uuid, null);
  reset role;

  select view_count into v_after from public.job_posts where id = current_setting('jobs.a')::uuid;
  if v_after <> v_before + 2 then
    raise exception 'view_dedupe_and_owner_excluded 실패 (조회 % → %)', v_before, v_after;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- effective_status_deadline: 마감일이 오늘(KST)이면 open, 어제면 expired(지원 거부).
--   수업일이 어제면 expired. expire_jobs가 저장 상태를 closed/expired로, 남은 지원을 not_selected로.
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_job uuid;
  v_app uuid;
  v_eff text;
  v_status text;
  v_reason text;
  v_blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_job := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '오늘 마감 공고', 'region', '서울', 'class_date', v_today + 3,
    'headcount', 2, 'description', '오늘 마감', 'deadline', v_today));

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(v_job, null);
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select s.effective_status into v_eff from public.get_job_summary(v_job) s;
  reset role;
  if v_eff is distinct from 'open' then raise exception 'effective_status_deadline 실패 (마감일 당일 %)', v_eff; end if;

  update public.job_posts set deadline = v_today - 1 where id = v_job;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select s.effective_status into v_eff from public.get_job_summary(v_job) s;
  reset role;
  if v_eff is distinct from 'expired' then raise exception 'effective_status_deadline 실패 (마감 다음 날 %)', v_eff; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  begin
    perform public.apply_to_job(v_job, null);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'effective_status_deadline 실패 (마감 지난 공고에 지원)'; end if;

  perform public.expire_jobs();
  reset role;

  select status, closed_reason into v_status, v_reason from public.job_posts where id = v_job;
  if v_status <> 'closed' or v_reason <> 'expired' then
    raise exception 'effective_status_deadline 실패 (정리 후 % / %)', v_status, v_reason;
  end if;
  select status into v_status from public.job_applications where id = v_app;
  if v_status <> 'not_selected' then
    raise exception 'effective_status_deadline 실패 (정리 후 지원 %)', v_status;
  end if;

  -- 수업일이 어제(마감일은 남아 있어도) → expired
  update public.job_posts
    set status = 'open', closed_reason = null, deadline = v_today + 5, class_date = v_today - 1
  where id = v_job;
  select public.job_effective_status(j) into v_eff from public.job_posts j where j.id = v_job;
  if v_eff <> 'expired' then raise exception 'effective_status_deadline 실패 (수업일 지남 %)', v_eff; end if;
end $$;

-- ---------------------------------------------------------------------
-- center_sees_applicant_resume_even_if_private: 비공개 프로필 강사I2가 C1 공고에 지원 →
--   C1은 I2의 이력서·이름·서류 사실을 본다. 지원받지 않은 C2는 못 본다.
--   서류 사실에는 파일 경로·번호가 없다. 비로그인은 강사 서류 사실을 못 받는다(센터 것은 받는다).
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_name text;
  v_facts jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.talent_profiles
    where user_id = 'f2000000-0000-4000-8000-0000000000a2';
  if n <> 1 then raise exception 'center_sees_applicant_resume_even_if_private 실패 (C1 이력서 %행)', n; end if;
  select display_name into v_name from public.profiles where id = 'f2000000-0000-4000-8000-0000000000a2';
  if v_name is distinct from '강사2' then
    raise exception 'center_sees_applicant_resume_even_if_private 실패 (C1이 본 이름 %)', v_name;
  end if;

  select coalesce(jsonb_agg(to_jsonb(f)), '[]') into v_facts
    from public.get_public_facts('f2000000-0000-4000-8000-0000000000a2') f;
  if jsonb_array_length(v_facts) <> 1 or v_facts -> 0 ->> 'doc_type' <> 'id_card' then
    raise exception 'center_sees_applicant_resume_even_if_private 실패 (서류 사실 %)', v_facts;
  end if;
  if (v_facts -> 0) ? 'file_path' or (v_facts -> 0) ? 'meta' or v_facts::text like '%900101%' then
    raise exception 'center_sees_applicant_resume_even_if_private 실패 (서류 사실에 원본 정보)';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.talent_profiles
    where user_id = 'f2000000-0000-4000-8000-0000000000a2';
  if n <> 0 then raise exception 'center_sees_applicant_resume_even_if_private 실패 (C2 이력서 %행)', n; end if;
  select count(*) into n from public.profiles where id = 'f2000000-0000-4000-8000-0000000000a2';
  if n <> 0 then raise exception 'center_sees_applicant_resume_even_if_private 실패 (C2 이름 %행)', n; end if;
  select count(*) into n from public.get_public_facts('f2000000-0000-4000-8000-0000000000a2');
  if n <> 0 then raise exception 'center_sees_applicant_resume_even_if_private 실패 (C2 서류 사실 %행)', n; end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into n from public.get_public_facts('f2000000-0000-4000-8000-0000000000a2');
  if n <> 0 then raise exception 'center_sees_applicant_resume_even_if_private 실패 (비로그인 강사 서류 사실 %행)', n; end if;
  select count(*) into n from public.get_public_facts('f2000000-0000-4000-8000-0000000000c1') f
    where f.doc_type in ('business_registration', 'travel_business');
  if n <> 2 then raise exception 'center_sees_applicant_resume_even_if_private 실패 (비로그인 센터 서류 사실 %행)', n; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- center_public_profile_detail_locked: 센터 공개 프로필은 누구나, 상세(주소 등)는 로그인 후.
--   공고 이력은 누구나(숨김 공고 제외).
-- ---------------------------------------------------------------------
do $$
declare
  v_name text;
  v_addr text;
  v_visible boolean;
  n int;
begin
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select p.center_name, p.address, p.detail_visible into v_name, v_addr, v_visible
    from public.get_center_public_profile(current_setting('jobs.center_c1')::uuid) p;
  if v_name is distinct from '센터일다이브' or v_addr is not null or v_visible then
    raise exception 'center_public_profile_detail_locked 실패 (비로그인 %, %, %)', v_name, v_addr, v_visible;
  end if;

  select count(*) into n from public.list_center_job_history(current_setting('jobs.center_c1')::uuid);
  if n <> 3 then raise exception 'center_public_profile_detail_locked 실패 (C1 공고 이력 %행)', n; end if;
  select count(*) into n from public.list_center_job_history(current_setting('jobs.center_c2')::uuid) h
    where h.id = current_setting('jobs.x')::uuid;
  if n <> 0 then raise exception 'center_public_profile_detail_locked 실패 (숨김 공고가 이력에)'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  select p.address into v_addr
    from public.get_center_public_profile(current_setting('jobs.center_c1')::uuid) p;
  reset role;
  if v_addr is distinct from '서울시 송파구 1' then
    raise exception 'center_public_profile_detail_locked 실패 (로그인 강사 주소 %)', v_addr;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- edit_keeps_created_at: 공고 수정은 주인만. 등록일은 그대로, 수정일이 생긴다.
--   이미 선택한 수보다 인원을 줄일 수 없다. 선택 수와 같게 줄이면 인원 마감.
--   공고A(인원 3): I1 선택 + I2 선택 → 선택 2명
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_created timestamptz := now() - interval '2 days';
  v_payload jsonb := jsonb_build_object(
    'job_type', 'lesson', 'title', '풀 세션 보조강사(수정)', 'region', '서울', 'venue', '잠실 풀',
    'class_date', v_today + 7, 'start_time', '09:00', 'end_time', '13:00',
    'pay_amount', 130000, 'pay_unit', 'per_class', 'headcount', 3,
    'description', '상세 설명 A 수정', 'deadline', v_today + 6);
  v_blocked boolean;
  r public.job_posts;
  v_status text;
begin
  update public.job_posts set created_at = v_created where id = current_setting('jobs.a')::uuid;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.select_applicant(current_setting('jobs.app_a2')::uuid);

  -- 다른 센터는 수정 불가
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.update_job_post(current_setting('jobs.a')::uuid, v_payload);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'edit_keeps_created_at 실패 (다른 센터가 수정)'; end if;

  -- 선택 2명인데 인원 1로 줄이기
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.update_job_post(current_setting('jobs.a')::uuid, v_payload || '{"headcount": 1}');
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'edit_keeps_created_at 실패 (선택 수보다 적은 인원)'; end if;

  perform public.update_job_post(current_setting('jobs.a')::uuid, v_payload);
  reset role;

  select * into r from public.job_posts where id = current_setting('jobs.a')::uuid;
  if r.created_at <> v_created or r.edited_at is null
     or r.title <> '풀 세션 보조강사(수정)' or r.pay_amount <> 130000 or r.status <> 'open' then
    raise exception 'edit_keeps_created_at 실패 (등록 % / 수정 % / 제목 % / 상태 %)',
      r.created_at, r.edited_at, r.title, r.status;
  end if;

  -- 인원을 선택 수(2)와 같게 → 인원 마감, 남은 지원(I4) 미선택
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.update_job_post(current_setting('jobs.a')::uuid, v_payload || '{"headcount": 2}');
  reset role;

  select * into r from public.job_posts where id = current_setting('jobs.a')::uuid;
  if r.status <> 'closed' or r.closed_reason <> 'full' or r.created_at <> v_created then
    raise exception 'edit_keeps_created_at 실패 (인원 맞춘 뒤 % / %)', r.status, r.closed_reason;
  end if;
  select status into v_status from public.job_applications where id = current_setting('jobs.app_a4')::uuid;
  if v_status <> 'not_selected' then raise exception 'edit_keeps_created_at 실패 (I4 %)', v_status; end if;

  -- 마감된 공고는 수정 불가
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.update_job_post(current_setting('jobs.a')::uuid, v_payload);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'edit_keeps_created_at 실패 (마감 공고 수정)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- banned_cannot_apply_or_post: 퇴출 센터C4는 공고 등록·선택·마감 거부, 그 공고는 목록에서 사라지고
--   지원도 안 된다. 퇴출 강사I3는 지원 거부. 퇴출 계정은 남의 이름(센터 이름 포함)도 못 본다.
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_job uuid;
  v_app uuid;
  v_blocked boolean;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c4', 'role', 'authenticated')::text, true);
  v_job := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '퇴출될 센터 공고', 'region', '서울', 'class_date', v_today + 5,
    'headcount', 1, 'description', 'C4 공고', 'deadline', v_today + 4));
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(v_job, null);

  -- 퇴출 전 C4가 I1을 선택 → 대조군: 연락처 1행
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c4', 'role', 'authenticated')::text, true);
  perform public.select_applicant(v_app);
  select count(*) into n from public.get_applicant_contact(v_app);
  if n <> 1 then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 전 연락처 %행)', n; end if;
  reset role;

  -- 선택으로 인원이 찬 공고를 다시 열어 둔다(퇴출 뒤 공고 목록 제외를 공고 상태가 아니라 계정 상태로 확인하려고)
  update public.job_posts set status = 'open', closed_reason = null, headcount = 2 where id = v_job;

  update public.profiles set account_status = 'banned' where id = 'f2000000-0000-4000-8000-0000000000c4';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c4', 'role', 'authenticated')::text, true);

  v_blocked := false;
  begin
    perform public.create_job_post(jsonb_build_object(
      'job_type', 'lesson', 'title', '퇴출 후 공고', 'region', '서울', 'class_date', v_today + 5,
      'headcount', 1, 'description', 'x', 'deadline', v_today + 4));
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 센터 등록)'; end if;

  v_blocked := false;
  begin
    perform public.select_applicant(v_app);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 센터 선택)'; end if;

  v_blocked := false;
  begin
    perform public.close_job_post(v_job);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 센터 마감)'; end if;

  -- 선택한 지원자라도 퇴출된 센터에는 연락처가 열리지 않는다(is_active 관문)
  select count(*) into n from public.get_applicant_contact(v_app);
  if n <> 0 then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 센터가 선택한 지원자 연락처 %행)', n; end if;

  -- 퇴출 강사 I3
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(current_setting('jobs.t')::uuid, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 강사 지원)'; end if;

  select count(*) into n from public.profiles where id = 'f2000000-0000-4000-8000-0000000000c1';
  if n <> 0 then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 강사가 센터 이름 봄)'; end if;

  -- 퇴출 센터의 공고에는 지원할 수 없다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(v_job, null);
  exception when no_data_found then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 센터 공고에 지원)'; end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into n from public.list_public_jobs(null, null, false, 100, 0) s where s.id = v_job;
  if n <> 0 then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 센터 공고가 목록에)'; end if;
  select count(*) into n from public.get_job_summary(v_job);
  if n <> 0 then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 센터 공고 요약)'; end if;
  reset role;

  select count(*) into n from public.job_posts
    where owner_id = 'f2000000-0000-4000-8000-0000000000c4';
  if n <> 1 then raise exception 'banned_cannot_apply_or_post 실패 (C4 공고 %행)', n; end if;
  select count(*) into n from public.job_applications where id = v_app and status = 'selected';
  if n <> 1 then raise exception 'banned_cannot_apply_or_post 실패 (C4 지원 상태 바뀜)'; end if;

  -- 퇴출 계정(C4)의 서류 사실은 비로그인에게 안 나간다
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into n from public.get_public_facts('f2000000-0000-4000-8000-0000000000c4');
  reset role;
  if n <> 0 then raise exception 'banned_cannot_apply_or_post 실패 (퇴출 센터 서류 사실 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- public_facts_multi_role_scoped: 센터+강사 계정 M(사업자등록증·강사 자격증 확인)의 서류 사실을
--   비로그인은 센터 서류(사업자등록증)만 받는다. 본인은 둘 다 본다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_types text[];
begin
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select array_agg(f.doc_type order by f.doc_type) into v_types
    from public.get_public_facts('f2000000-0000-4000-8000-0000000000b1') f;
  reset role;
  if v_types is distinct from array['business_registration']::text[] then
    raise exception 'public_facts_multi_role_scoped 실패 (비로그인이 받은 사실 %)', v_types;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000b1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_public_facts('f2000000-0000-4000-8000-0000000000b1');
  reset role;
  if n <> 2 then raise exception 'public_facts_multi_role_scoped 실패 (본인 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- withdrawn_applicant_hidden_again: 비공개 강사I2가 C2 공고에 지원하면 C2가 이력서·이름을 보고,
--   지원을 취소하면 다시 못 본다.
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_job uuid;
  v_app uuid;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_job := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', 'C2 수업 공고', 'region', '부산', 'class_date', v_today + 9,
    'headcount', 1, 'description', 'C2 공고', 'deadline', v_today + 8));

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(v_job, null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.talent_profiles where user_id = 'f2000000-0000-4000-8000-0000000000a2';
  if n <> 1 then raise exception 'withdrawn_applicant_hidden_again 실패 (지원 중 이력서 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  perform public.withdraw_application(v_app);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.talent_profiles where user_id = 'f2000000-0000-4000-8000-0000000000a2';
  if n <> 0 then raise exception 'withdrawn_applicant_hidden_again 실패 (취소 후 이력서 %행)', n; end if;
  select count(*) into n from public.profiles where id = 'f2000000-0000-4000-8000-0000000000a2';
  if n <> 0 then raise exception 'withdrawn_applicant_hidden_again 실패 (취소 후 이름 %행)', n; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- close_expired_records_expired: 기한이 지났지만 저장 상태가 open인 공고를 주인이 마감하면 사유는 expired
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_job uuid;
  v_reason text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_job := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '기한 지난 공고', 'region', '부산', 'class_date', v_today + 3,
    'headcount', 1, 'description', 'x', 'deadline', v_today));
  reset role;

  update public.job_posts set deadline = v_today - 1 where id = v_job;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  perform public.close_job_post(v_job);
  reset role;

  select closed_reason into v_reason from public.job_posts where id = v_job;
  if v_reason is distinct from 'expired' then
    raise exception 'close_expired_records_expired 실패 (사유 %)', v_reason;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- job_payload_limits: 상세 설명 3000자 초과, 자격 조건 11개, 월~일 밖의 근무 요일은 거부
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_base jsonb := jsonb_build_object(
    'job_type', 'affiliation', 'title', '한도 검사', 'region', '서울',
    'work_days', jsonb_build_array('월', '수'), 'headcount', 1, 'description', '설명', 'deadline', v_today + 14);
  v_bad jsonb[] := array[
    v_base || jsonb_build_object('description', repeat('가', 3001)),
    v_base || jsonb_build_object('requirement_tags',
      (select jsonb_agg('태그' || g::text) from generate_series(1, 11) g)),
    v_base || jsonb_build_object('work_days', jsonb_build_array('월', '공휴일'))
  ];
  v_payload jsonb;
  v_blocked boolean;
  i int := 0;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);

  -- 대조군: 기본 값은 통과(자격 조건 10개, 설명 3000자)
  perform public.create_job_post(v_base || jsonb_build_object(
    'description', repeat('가', 3000),
    'requirement_tags', (select jsonb_agg('태그' || g::text) from generate_series(1, 10) g)));

  foreach v_payload in array v_bad loop
    i := i + 1;
    v_blocked := false;
    begin
      perform public.create_job_post(v_payload);
    exception when invalid_parameter_value then
      v_blocked := true;
    end;
    if not v_blocked then raise exception 'job_payload_limits 실패 (%번째 값 통과)', i; end if;
  end loop;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- banned_applicant_not_selectable: 정지·퇴출된 지원자는 선택할 수 없고,
--   이미 선택된 지원자가 퇴출되면 연락처도 더는 열리지 않는다.
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_job uuid;
  v_app uuid;
  v_blocked boolean := false;
  v_status text;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_job := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '퇴출 지원자 검사', 'region', '서울', 'class_date', v_today + 9,
    'headcount', 2, 'description', 'x', 'deadline', v_today + 8));
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(v_job, null);
  reset role;

  update public.profiles set account_status = 'suspended' where id = 'f2000000-0000-4000-8000-0000000000a4';
  update public.profiles set account_status = 'banned' where id = 'f2000000-0000-4000-8000-0000000000a1';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f2000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  begin
    perform public.select_applicant(v_app);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'banned_applicant_not_selectable 실패 (정지된 지원자 선택)'; end if;

  -- 공고A에서 이미 선택된 I1이 퇴출 → 연락처 빈 결과
  select count(*) into n from public.get_applicant_contact(current_setting('jobs.app_a1')::uuid);
  reset role;
  if n <> 0 then raise exception 'banned_applicant_not_selectable 실패 (퇴출 지원자 연락처 %행)', n; end if;

  select status into v_status from public.job_applications where id = v_app;
  if v_status <> 'applied' then raise exception 'banned_applicant_not_selectable 실패 (지원 상태 %)', v_status; end if;
end $$;

rollback;

select 'jobs ok' as result;
