-- =====================================================================
-- 아쿠아잡 007 2단계 보안 보강 검사 (개발/테스트 전용) — 007 적용 후 실행
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다.
-- 성공하면 마지막에 'p2hardening ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
--
-- 검사 사이에 만든 공고·지원 id는 트랜잭션 설정값(p2h.*)에 담아 넘긴다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자. auth.users에 넣으면 가입 트리거가 돈다(→ 센터는 centers 행, 연락처 행도 생긴다).
--   C1 = f7000000-0000-4000-8000-0000000000c1 (센터, 사업자등록증·여행업 확인, 센터 소개 있음)
--   C2 = f7000000-0000-4000-8000-0000000000c2 (센터, 사업자등록증 확인)
--   I1 = f7000000-0000-4000-8000-0000000000a1 (강사, 공개 이력서)
--   I2 = f7000000-0000-4000-8000-0000000000a2 (강사, 비공개 이력서)
--   A  = f7000000-0000-4000-8000-0000000000d1 (관리자 + 강사 + 센터, 사업자등록증 확인)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'p2h-c1@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"보강센터1","phone":"010-7000-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-4000-8000-0000000000c2',
   'authenticated', 'authenticated', 'p2h-c2@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"보강센터2","phone":"010-7000-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'p2h-i1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"보강강사1","phone":"010-7000-0003"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'p2h-i2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"보강강사2","phone":"010-7000-0004"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'p2h-d@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"보강관리자"}', now(), now());

-- 관리자 지정·여러 역할은 운영과 같은 방식(postgres 세션의 update)으로 한다.
update public.profiles set roles = array['admin', 'instructor', 'center'], role = 'admin'
  where id = 'f7000000-0000-4000-8000-0000000000d1';

-- 무료 기간에서 시작한다(운영 값이 무엇이든 이 트랜잭션 안에서만)
update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

insert into public.talent_profiles (user_id, is_public) values
  ('f7000000-0000-4000-8000-0000000000a1', true),
  ('f7000000-0000-4000-8000-0000000000a2', false);

insert into public.center_profiles (user_id, center_name, representative_name, address, venues) values
  ('f7000000-0000-4000-8000-0000000000c1', '보강다이브', '대표칠', '서울시 7', array['잠실 풀']);

insert into public.verification_documents (id, owner_id, doc_type, file_path, meta) values
  ('f7d00000-0000-4000-8000-0000000000c1', 'f7000000-0000-4000-8000-0000000000c1',
   'business_registration', 'f7000000-0000-4000-8000-0000000000c1/biz.jpg', '{}'),
  ('f7d00000-0000-4000-8000-0000000000c9', 'f7000000-0000-4000-8000-0000000000c1',
   'travel_business', 'f7000000-0000-4000-8000-0000000000c1/travel.jpg', '{}'),
  ('f7d00000-0000-4000-8000-0000000000c2', 'f7000000-0000-4000-8000-0000000000c2',
   'business_registration', 'f7000000-0000-4000-8000-0000000000c2/biz.jpg', '{}'),
  ('f7d00000-0000-4000-8000-0000000000d1', 'f7000000-0000-4000-8000-0000000000d1',
   'business_registration', 'f7000000-0000-4000-8000-0000000000d1/biz.jpg', '{}');

-- 서류 확인 → 센터 id 기록 → 공고·지원 준비
--   p2h.j1 = C1 수업 공고(인원 3), p2h.ja = 관리자 공고(인원 2), p2h.j2 = C2 수업 공고(인원 1)
--   p2h.app_i1_j1 = I1 → J1 (C1이 선택), p2h.app_i2_j1 = I2 → J1 (지원함), p2h.app_i1_ja = I1 → JA (지원함)
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_id uuid;
begin
  perform set_config('p2h.center_c1',
    (select c.id::text from public.centers c where c.owner_user_id = 'f7000000-0000-4000-8000-0000000000c1'), true);
  perform set_config('p2h.center_c2',
    (select c.id::text from public.centers c where c.owner_user_id = 'f7000000-0000-4000-8000-0000000000c2'), true);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('f7d00000-0000-4000-8000-0000000000c1', 'verified', null, null);
  perform public.review_document('f7d00000-0000-4000-8000-0000000000c9', 'verified', null, null);
  perform public.review_document('f7d00000-0000-4000-8000-0000000000c2', 'verified', null, null);
  perform public.review_document('f7d00000-0000-4000-8000-0000000000d1', 'verified', null, null);

  v_id := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '관리자 수업 공고', 'region', '서울',
    'class_date', v_today + 10, 'headcount', 2, 'description', '관리자 공고', 'deadline', v_today + 9));
  perform set_config('p2h.ja', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_id := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '보강 수업 공고', 'region', '서울', 'venue', '잠실 풀',
    'class_date', v_today + 10, 'headcount', 3, 'description', '보강 설명', 'deadline', v_today + 9));
  perform set_config('p2h.j1', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_id := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '둘째 센터 공고', 'region', '부산',
    'class_date', v_today + 10, 'headcount', 1, 'description', 'C2 설명', 'deadline', v_today + 9));
  perform set_config('p2h.j2', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_id := public.apply_to_job(current_setting('p2h.j1')::uuid, null);
  perform set_config('p2h.app_i1_j1', v_id::text, true);
  v_id := public.apply_to_job(current_setting('p2h.ja')::uuid, null);
  perform set_config('p2h.app_i1_ja', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
  v_id := public.apply_to_job(current_setting('p2h.j1')::uuid, null);
  perform set_config('p2h.app_i2_j1', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.select_applicant(current_setting('p2h.app_i1_j1')::uuid);
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- payload_bounds: 마감일 > 오늘+90일, 수업일·투어 시작일보다 늦은 마감일, 목록 밖 지역,
--   101자 장소·근무 시간·행선지, 21자 자격 조건은 거부(22023). 수정(update_job_post)도 같은 검사.
--   대조군: 경계값(90일, 100자, 20자, 마감일 = 시작일)은 통과.
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_lesson jsonb := jsonb_build_object(
    'job_type', 'lesson', 'title', '한도 검사 수업', 'region', '제주',
    'class_date', v_today + 90, 'headcount', 1, 'description', '설명', 'deadline', v_today + 90);
  v_aff jsonb := jsonb_build_object(
    'job_type', 'affiliation', 'title', '한도 검사 소속', 'region', '서울',
    'work_days', jsonb_build_array('월'), 'headcount', 1, 'description', '설명', 'deadline', v_today + 14);
  v_tour jsonb := jsonb_build_object(
    'job_type', 'tour', 'title', '한도 검사 투어', 'region', '해외',
    'tour_start', v_today + 30, 'tour_end', v_today + 34, 'destination', '보홀',
    'headcount', 1, 'description', '설명', 'deadline', v_today + 30);
  v_bad jsonb[];
  v_payload jsonb;
  v_blocked boolean;
  i int := 0;
begin
  v_bad := array[
    v_lesson || jsonb_build_object('class_date', v_today + 100, 'deadline', v_today + 91),
    v_lesson || jsonb_build_object('class_date', v_today + 5, 'deadline', v_today + 6),
    v_tour || jsonb_build_object('deadline', v_today + 31),
    v_lesson || jsonb_build_object('region', '화성'),
    v_lesson || jsonb_build_object('venue', repeat('가', 101)),
    v_aff || jsonb_build_object('work_time', repeat('가', 101)),
    v_tour || jsonb_build_object('destination', repeat('가', 101)),
    v_lesson || jsonb_build_object('requirement_tags', jsonb_build_array(repeat('가', 21)))
  ];

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);

  -- 대조군: 경계값은 통과
  perform public.create_job_post(v_lesson || jsonb_build_object(
    'venue', repeat('가', 100), 'requirement_tags', jsonb_build_array(repeat('가', 20))));
  perform public.create_job_post(v_aff || jsonb_build_object('work_time', repeat('가', 100)));
  perform public.create_job_post(v_tour || jsonb_build_object('destination', repeat('가', 100)));

  foreach v_payload in array v_bad loop
    i := i + 1;
    v_blocked := false;
    begin
      perform public.create_job_post(v_payload);
    exception when invalid_parameter_value then
      v_blocked := true;
    end;
    if not v_blocked then raise exception 'payload_bounds 실패 (%번째 값 통과)', i; end if;
  end loop;

  -- 수정도 같은 검사(목록 밖 지역)
  v_blocked := false;
  begin
    perform public.update_job_post(current_setting('p2h.j1')::uuid, jsonb_build_object(
      'title', '보강 수업 공고', 'region', '화성', 'class_date', v_today + 10,
      'headcount', 3, 'description', '보강 설명', 'deadline', v_today + 9));
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'payload_bounds 실패 (수정에서 목록 밖 지역 통과)'; end if;
  reset role;

  if exists (select 1 from public.job_posts where region = '화성') then
    raise exception 'payload_bounds 실패 (화성 공고가 저장됨)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- center_profiles_owner_only: 다른 센터·강사·비로그인은 center_profiles를 직접 0행,
--   주인·관리자는 1행. 공개 RPC(get_center_public_profile · get_job_detail)는 그대로 공개 칸을 준다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_name text;
  v_venues text[];
  v_addr text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.center_profiles where user_id = 'f7000000-0000-4000-8000-0000000000c1';
  if n <> 0 then raise exception 'center_profiles_owner_only 실패 (다른 센터 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.center_profiles;
  if n <> 0 then raise exception 'center_profiles_owner_only 실패 (강사 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.center_profiles where user_id = 'f7000000-0000-4000-8000-0000000000c1';
  if n <> 1 then raise exception 'center_profiles_owner_only 실패 (주인 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.center_profiles where user_id = 'f7000000-0000-4000-8000-0000000000c1';
  if n <> 1 then raise exception 'center_profiles_owner_only 실패 (관리자 %행)', n; end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    select count(*) into n from public.center_profiles;
  exception when insufficient_privilege then
    n := 0;
  end;
  if n <> 0 then raise exception 'center_profiles_owner_only 실패 (비로그인 %행)', n; end if;

  -- 공개 RPC: 비로그인은 공개 칸만
  select p.center_name, p.venues, p.address into v_name, v_venues, v_addr
    from public.get_center_public_profile(current_setting('p2h.center_c1')::uuid) p;
  if v_name is distinct from '보강다이브' or v_venues is distinct from array['잠실 풀'] or v_addr is not null then
    raise exception 'center_profiles_owner_only 실패 (비로그인 RPC %, %, %)', v_name, v_venues, v_addr;
  end if;
  reset role;

  -- 로그인 강사: RPC로 상세 칸(주소)까지
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_addr := null;
  select p.address into v_addr
    from public.get_center_public_profile(current_setting('p2h.center_c1')::uuid) p;
  if v_addr is distinct from '서울시 7' then
    raise exception 'center_profiles_owner_only 실패 (강사 RPC 주소 %)', v_addr;
  end if;
  v_addr := null;
  select d.center ->> 'address' into v_addr from public.get_job_detail(current_setting('p2h.j1')::uuid) d;
  if v_addr is distinct from '서울시 7' then
    raise exception 'center_profiles_owner_only 실패 (공고 상세 주소 %)', v_addr;
  end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- owner_id_hidden_from_others: 공고 owner_id는 주인·관리자에게만, 그 밖(비로그인·강사·다른 센터)은 null.
--   center_id는 누구에게나. 센터 공개 프로필 user_id도 같은 규칙, 센터 서류 사실은 centers.id로 받는다.
-- ---------------------------------------------------------------------
do $$
declare
  v_owner uuid;
  v_center uuid;
  n int;
  c1 constant uuid := 'f7000000-0000-4000-8000-0000000000c1';
begin
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select s.owner_id, s.center_id into v_owner, v_center
    from public.list_public_jobs(null, null, false, 100, 0) s where s.id = current_setting('p2h.j1')::uuid;
  if v_owner is not null or v_center is distinct from current_setting('p2h.center_c1')::uuid then
    raise exception 'owner_id_hidden_from_others 실패 (비로그인 목록 %, %)', v_owner, v_center;
  end if;
  select s.owner_id, s.center_id into v_owner, v_center
    from public.get_job_summary(current_setting('p2h.j1')::uuid) s;
  if v_owner is not null or v_center is distinct from current_setting('p2h.center_c1')::uuid then
    raise exception 'owner_id_hidden_from_others 실패 (비로그인 요약 %, %)', v_owner, v_center;
  end if;
  select p.user_id into v_owner from public.get_center_public_profile(current_setting('p2h.center_c1')::uuid) p;
  if v_owner is not null then raise exception 'owner_id_hidden_from_others 실패 (비로그인 센터 프로필 user_id)'; end if;
  select count(*) into n from public.get_center_public_facts(current_setting('p2h.center_c1')::uuid) f
    where f.doc_type in ('business_registration', 'travel_business');
  if n <> 2 then raise exception 'owner_id_hidden_from_others 실패 (비로그인 센터 서류 사실 %행)', n; end if;
  reset role;

  set local role authenticated;
  -- 강사: 상세에서도 null
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  select d.owner_id, d.center_id into v_owner, v_center from public.get_job_detail(current_setting('p2h.j1')::uuid) d;
  if v_owner is not null or v_center is distinct from current_setting('p2h.center_c1')::uuid then
    raise exception 'owner_id_hidden_from_others 실패 (강사 상세 %, %)', v_owner, v_center;
  end if;

  -- 다른 센터: 목록에서 null
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select s.owner_id into v_owner
    from public.list_public_jobs(null, null, false, 100, 0) s where s.id = current_setting('p2h.j1')::uuid;
  if v_owner is not null then raise exception 'owner_id_hidden_from_others 실패 (다른 센터 목록 %)', v_owner; end if;

  -- 주인: 요약·상세·센터 프로필에서 자기 id
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select s.owner_id into v_owner from public.get_job_summary(current_setting('p2h.j1')::uuid) s;
  if v_owner is distinct from c1 then raise exception 'owner_id_hidden_from_others 실패 (주인 요약 %)', v_owner; end if;
  select d.owner_id into v_owner from public.get_job_detail(current_setting('p2h.j1')::uuid) d;
  if v_owner is distinct from c1 then raise exception 'owner_id_hidden_from_others 실패 (주인 상세 %)', v_owner; end if;
  select p.user_id into v_owner from public.get_center_public_profile(current_setting('p2h.center_c1')::uuid) p;
  if v_owner is distinct from c1 then raise exception 'owner_id_hidden_from_others 실패 (주인 센터 프로필 %)', v_owner; end if;

  -- 관리자: 목록에서 주인 id
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  select s.owner_id into v_owner
    from public.list_public_jobs(null, null, false, 100, 0) s where s.id = current_setting('p2h.j1')::uuid;
  if v_owner is distinct from c1 then raise exception 'owner_id_hidden_from_others 실패 (관리자 목록 %)', v_owner; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- owner_sees_no_withdrawn_applications: I1이 C2 공고에 지원 → C2는 1행.
--   I1이 취소하면 C2는 0행, I1 본인은 취소 행을 계속 본다, 관리자도 본다.
-- ---------------------------------------------------------------------
do $$
declare
  v_app uuid;
  v_status text;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(current_setting('p2h.j2')::uuid, null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications where id = v_app;
  if n <> 1 then raise exception 'owner_sees_no_withdrawn_applications 실패 (취소 전 주인 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  perform public.withdraw_application(v_app);
  select status into v_status from public.job_applications where id = v_app;
  if v_status is distinct from 'withdrawn' then
    raise exception 'owner_sees_no_withdrawn_applications 실패 (본인이 본 상태 %)', v_status;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications where id = v_app;
  if n <> 0 then raise exception 'owner_sees_no_withdrawn_applications 실패 (취소 후 주인 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications where id = v_app;
  if n <> 1 then raise exception 'owner_sees_no_withdrawn_applications 실패 (관리자 %행)', n; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- banned_center_reads_no_resumes / banned_center_reads_no_applications:
--   대조군: 활성 C1은 공개 이력서(I1)·지원자 이력서(I2, 비공개)와 자기 공고 지원 2행을 본다.
--   C1이 퇴출되면 직접 조회(REST 경로)로 이력서 0행, 지원 0행.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.talent_profiles
    where user_id in ('f7000000-0000-4000-8000-0000000000a1', 'f7000000-0000-4000-8000-0000000000a2');
  if n <> 2 then raise exception 'banned_center_reads_no_resumes 실패 (활성 센터 %행)', n; end if;
  select count(*) into n from public.job_applications where job_id = current_setting('p2h.j1')::uuid;
  if n <> 2 then raise exception 'banned_center_reads_no_applications 실패 (활성 센터 %행)', n; end if;
  reset role;

  update public.profiles set account_status = 'banned' where id = 'f7000000-0000-4000-8000-0000000000c1';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.talent_profiles
    where user_id in ('f7000000-0000-4000-8000-0000000000a1', 'f7000000-0000-4000-8000-0000000000a2');
  if n <> 0 then raise exception 'banned_center_reads_no_resumes 실패 (퇴출 센터 %행)', n; end if;
  select count(*) into n from public.job_applications where job_id = current_setting('p2h.j1')::uuid;
  if n <> 0 then raise exception 'banned_center_reads_no_applications 실패 (퇴출 센터 %행)', n; end if;
  reset role;

  update public.profiles set account_status = 'active' where id = 'f7000000-0000-4000-8000-0000000000c1';
end $$;

-- ---------------------------------------------------------------------
-- update_rechecks_requirements: C2는 서류가 유효할 때 공고를 고칠 수 있고(대조군),
--   사업자등록증이 반려 상태가 되면 수정이 거부된다(42501).
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_payload jsonb := jsonb_build_object(
    'title', '둘째 센터 공고(수정)', 'region', '부산',
    'class_date', v_today + 10, 'headcount', 1, 'description', 'C2 설명', 'deadline', v_today + 9);
  v_blocked boolean := false;
  v_title text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  perform public.update_job_post(current_setting('p2h.j2')::uuid, v_payload);
  reset role;

  update public.verification_documents
    set status = 'rejected', reject_reason = '검사용 반려', verified_at = null
  where id = 'f7d00000-0000-4000-8000-0000000000c2';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  begin
    perform public.update_job_post(current_setting('p2h.j2')::uuid, v_payload || '{"title": "서류 없이 수정"}');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'update_rechecks_requirements 실패 (서류 없이 수정)'; end if;

  select title into v_title from public.job_posts where id = current_setting('p2h.j2')::uuid;
  if v_title is distinct from '둘째 센터 공고(수정)' then
    raise exception 'update_rechecks_requirements 실패 (제목 %)', v_title;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- paid_mode_blocks_update_select_contact: 유료 전환(paid_mode=true) 뒤 구독 없는 센터 C1은
--   공고 수정·지원자 선택 거부(42501), 선택한 지원자 연락처 빈 결과, 이력서(공개·지원자) 0행.
--   공고 마감(close_job_post)은 된다. 관리자 A(운영자 계정의 센터)는 수정·선택·연락처 모두 된다.
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_blocked boolean;
  v_status text;
  v_title text;
  n int;
begin
  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);

  v_blocked := false;
  begin
    perform public.update_job_post(current_setting('p2h.j1')::uuid, jsonb_build_object(
      'title', '구독 없이 수정', 'region', '서울', 'class_date', v_today + 10,
      'headcount', 3, 'description', '보강 설명', 'deadline', v_today + 9));
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'paid_mode_blocks_update_select_contact 실패 (구독 없이 수정)'; end if;

  v_blocked := false;
  begin
    perform public.select_applicant(current_setting('p2h.app_i2_j1')::uuid);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'paid_mode_blocks_update_select_contact 실패 (구독 없이 선택)'; end if;

  select count(*) into n from public.get_applicant_contact(current_setting('p2h.app_i1_j1')::uuid);
  if n <> 0 then raise exception 'paid_mode_blocks_update_select_contact 실패 (구독 없이 연락처 %행)', n; end if;

  select count(*) into n from public.talent_profiles
    where user_id in ('f7000000-0000-4000-8000-0000000000a1', 'f7000000-0000-4000-8000-0000000000a2');
  if n <> 0 then raise exception 'paid_mode_blocks_update_select_contact 실패 (구독 없이 이력서 %행)', n; end if;

  -- 마감은 구독 없이도 된다
  perform public.close_job_post(current_setting('p2h.j1')::uuid);

  -- 관리자 A: 수정·선택·연락처
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f7000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.update_job_post(current_setting('p2h.ja')::uuid, jsonb_build_object(
    'title', '관리자 공고(수정)', 'region', '서울', 'class_date', v_today + 10,
    'headcount', 2, 'description', '관리자 공고', 'deadline', v_today + 9));
  perform public.select_applicant(current_setting('p2h.app_i1_ja')::uuid);
  select count(*) into n from public.get_applicant_contact(current_setting('p2h.app_i1_ja')::uuid);
  if n <> 1 then raise exception 'paid_mode_blocks_update_select_contact 실패 (관리자 연락처 %행)', n; end if;
  select count(*) into n from public.talent_profiles
    where user_id in ('f7000000-0000-4000-8000-0000000000a1', 'f7000000-0000-4000-8000-0000000000a2');
  if n <> 2 then raise exception 'paid_mode_blocks_update_select_contact 실패 (관리자 이력서 %행)', n; end if;
  reset role;

  select status into v_status from public.job_posts where id = current_setting('p2h.j1')::uuid;
  if v_status is distinct from 'closed' then
    raise exception 'paid_mode_blocks_update_select_contact 실패 (구독 없이 마감 %)', v_status;
  end if;
  select title into v_title from public.job_posts where id = current_setting('p2h.j1')::uuid;
  if v_title is distinct from '보강 수업 공고' then
    raise exception 'paid_mode_blocks_update_select_contact 실패 (C1 공고 제목 %)', v_title;
  end if;
  select status into v_status from public.job_applications where id = current_setting('p2h.app_i1_ja')::uuid;
  if v_status is distinct from 'selected' then
    raise exception 'paid_mode_blocks_update_select_contact 실패 (관리자 선택 %)', v_status;
  end if;
  select title into v_title from public.job_posts where id = current_setting('p2h.ja')::uuid;
  if v_title is distinct from '관리자 공고(수정)' then
    raise exception 'paid_mode_blocks_update_select_contact 실패 (관리자 수정 %)', v_title;
  end if;

  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';
end $$;

rollback;

select 'p2hardening ok' as result;
