-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)의 SQL Editor에서 실행 — 워너다이브 프로젝트에서 실행하지 말 것
-- =====================================================================
-- 아쿠아잡 009 제안 검사 (개발/테스트 전용) — 009 적용 후 실행
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다.
-- 성공하면 마지막에 'offers ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
--
-- 검사 사이에 만든 공고·제안 id는 트랜잭션 설정값(p3o.*)에 담아 넘긴다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자. auth.users에 넣으면 가입 트리거가 돈다(→ 센터는 centers 행, 연락처 행도 생긴다).
--   C1 = f9000000-0000-4000-8000-0000000000c1 (센터, 사업자등록증 확인 — 공고 주인)
--   C2 = f9000000-0000-4000-8000-0000000000c2 (센터, 사업자등록증 확인 — 다른 센터)
--   I1 = f9000000-0000-4000-8000-0000000000a1 (강사, 공개 이력서, 서울·풀·토, AIDA 자격, 강사 자격증 확인, 소개 300자)
--   I2 = f9000000-0000-4000-8000-0000000000a2 (강사, 비공개 이력서)
--   I3 = f9000000-0000-4000-8000-0000000000a3 (강사, 공개 이력서 — 정지·퇴출 검사용)
--   I4 = f9000000-0000-4000-8000-0000000000a4 (강사, 공개 이력서 — 지원자)
--   I5 = f9000000-0000-4000-8000-0000000000a5 (강사, 공개 이력서, 서류 없음 — 지원자)
--   A  = f9000000-0000-4000-8000-0000000000d1 (관리자 + 강사 + 센터, 공개 이력서, 사업자등록증 확인 — 자기에게 제안 검사)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'p3o-c1@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"제안센터1","phone":"010-9000-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-8000-0000000000c2',
   'authenticated', 'authenticated', 'p3o-c2@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"제안센터2","phone":"010-9000-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'p3o-i1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"제안강사1","phone":"010-9000-0011"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'p3o-i2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"제안강사2","phone":"010-9000-0012"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-8000-0000000000a3',
   'authenticated', 'authenticated', 'p3o-i3@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"제안강사3","phone":"010-9000-0013"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-8000-0000000000a4',
   'authenticated', 'authenticated', 'p3o-i4@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"제안강사4","phone":"010-9000-0014"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-8000-0000000000a5',
   'authenticated', 'authenticated', 'p3o-i5@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"제안강사5","phone":"010-9000-0015"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'p3o-d@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"제안관리자"}', now(), now());

update public.profiles set roles = array['admin', 'instructor', 'center'], role = 'admin'
  where id = 'f9000000-0000-4000-8000-0000000000d1';

-- 무료 기간에서 시작한다(운영 값이 무엇이든 이 트랜잭션 안에서만)
update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

insert into public.talent_profiles
  (user_id, is_public, onboarding_done, regions, scopes, available_days, certifications, intro, mbti, past_centers)
values
  ('f9000000-0000-4000-8000-0000000000a1', true, true, array['서울'], array['pool'], array['토'],
   '[{"org":"AIDA","level":"Instructor"}]', repeat('가', 300), 'INTJ', array['비밀센터']),
  ('f9000000-0000-4000-8000-0000000000a2', false, true, array['서울'], array['pool'], array['토'],
   '[]', '비공개', null, '{}'),
  ('f9000000-0000-4000-8000-0000000000a3', true, true, array['서울'], array['pool'], array['토'],
   '[]', '공개3', null, '{}'),
  ('f9000000-0000-4000-8000-0000000000a4', true, true, array['서울'], array['pool'], array['토'],
   '[]', '공개4', null, '{}'),
  ('f9000000-0000-4000-8000-0000000000a5', true, true, array['서울'], array['pool'], array['토'],
   '[{"org":"AIDA","level":"Instructor"}]', '공개5', null, '{}'),
  ('f9000000-0000-4000-8000-0000000000d1', true, true, array['서울'], array['pool'], array['토'],
   '[]', '관리자 겸 강사', null, '{}');

insert into public.verification_documents (id, owner_id, doc_type, file_path, meta) values
  ('f9d00000-0000-4000-8000-0000000000c1', 'f9000000-0000-4000-8000-0000000000c1',
   'business_registration', 'f9000000-0000-4000-8000-0000000000c1/biz.jpg', '{}'),
  ('f9d00000-0000-4000-8000-0000000000c2', 'f9000000-0000-4000-8000-0000000000c2',
   'business_registration', 'f9000000-0000-4000-8000-0000000000c2/biz.jpg', '{}'),
  ('f9d00000-0000-4000-8000-0000000000a1', 'f9000000-0000-4000-8000-0000000000a1',
   'instructor_cert', 'f9000000-0000-4000-8000-0000000000a1/cert.jpg', '{"org":"AIDA","grade":"Instructor"}'),
  ('f9d00000-0000-4000-8000-0000000000d1', 'f9000000-0000-4000-8000-0000000000d1',
   'business_registration', 'f9000000-0000-4000-8000-0000000000d1/biz.jpg', '{}');

-- 서류 확인 → 공고 준비 (모두 C1 수업 공고)
--   p3o.j1 인원 1 (선택 뒤 수락 거부)     p3o.j2 인원 2 (한도·중복·철회)
--   p3o.j4 인원 1 (제안 한도 5건)          p3o.jc 인원 1 (마감된 공고)
--   p3o.j5 인원 2 (수락 1 + 선택 1)        p3o.j6 인원 1 (수락 뒤 선택 거부 · 연락처)
--   p3o.j7 인원 1 (유료 전환 수락·거절)    p3o.j9 인원 1 (직접 마감)   p3o.j10 인원 1 (기한 지남)
--   p3o.j11 인원 3 (수락 1 + 선택 1 뒤 공고 수정 인원)
--   p3o.jd 인원 1 (관리자 A의 공고 — 자기에게 제안)
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_key text;
  v_head int;
  v_id uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('f9d00000-0000-4000-8000-0000000000c1', 'verified', null, null);
  perform public.review_document('f9d00000-0000-4000-8000-0000000000c2', 'verified', null, null);
  perform public.review_document('f9d00000-0000-4000-8000-0000000000a1', 'verified', v_today + 365, null);
  perform public.review_document('f9d00000-0000-4000-8000-0000000000d1', 'verified', null, null);
  v_id := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '제안 공고 jd', 'region', '서울',
    'class_date', v_today + 10, 'headcount', 1, 'description', '제안 설명', 'deadline', v_today + 9));
  perform set_config('p3o.jd', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  for v_key, v_head in
    select * from (values ('j1', 1), ('j2', 2), ('j4', 1), ('jc', 1), ('j5', 2), ('j6', 1),
                          ('j7', 1), ('j9', 1), ('j10', 1), ('j11', 3)) v(k, h)
  loop
    v_id := public.create_job_post(jsonb_build_object(
      'job_type', 'lesson', 'title', '제안 공고 ' || v_key, 'region', '서울',
      'class_date', v_today + 10, 'headcount', v_head, 'description', '제안 설명', 'deadline', v_today + 9));
    perform set_config('p3o.' || v_key, v_id::text, true);
  end loop;
  perform public.close_job_post(current_setting('p3o.jc')::uuid);
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- browse_blocked_unsubscribed_or_inactive:
--   대조군: 무료 기간 활성 센터 C1은 둘러보기에서 I1을 본다.
--   유료 전환 뒤 구독 없는 C1 · 퇴출된 C1 · 정지된 C1 · 강사 I1 · 비로그인은 거부.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_blocked boolean;
  v_status text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.browse_instructors('{}'::jsonb, 50, 0) b
    where b.user_id = 'f9000000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'browse_blocked_unsubscribed_or_inactive 실패 (무료 기간 C1 %행)', n; end if;
  reset role;

  -- 유료 전환 + 구독 없음
  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform * from public.browse_instructors('{}'::jsonb, 50, 0);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'browse_blocked_unsubscribed_or_inactive 실패 (구독 없는 센터)'; end if;
  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

  -- 정지·퇴출 센터
  foreach v_status in array array['banned', 'suspended'] loop
    update public.profiles set account_status = v_status where id = 'f9000000-0000-4000-8000-0000000000c1';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
    v_blocked := false;
    begin
      perform * from public.browse_instructors('{}'::jsonb, 50, 0);
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    reset role;
    if not v_blocked then raise exception 'browse_blocked_unsubscribed_or_inactive 실패 (% 센터)', v_status; end if;
  end loop;
  update public.profiles set account_status = 'active' where id = 'f9000000-0000-4000-8000-0000000000c1';

  -- 강사
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform * from public.browse_instructors('{}'::jsonb, 50, 0);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'browse_blocked_unsubscribed_or_inactive 실패 (강사)'; end if;

  -- 비로그인(실행 권한 없음)
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_blocked := false;
  begin
    perform * from public.browse_instructors('{}'::jsonb, 50, 0);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'browse_blocked_unsubscribed_or_inactive 실패 (비로그인)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- browse_returns_only_public_active_no_contacts:
--   반환 칸에 연락처·비공개 칸이 없다. 비공개 I2 · 퇴출 I3 · 센터만인 C2 · 나(C1)는 안 나온다.
--   소개는 200자로 잘린다. 서류 사실(강사 자격증)은 나온다. 필터가 걸러 낸다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_intro text;
  v_facts jsonb;
  v_args text[];
begin
  select f.proargnames into v_args from pg_proc f
  where f.pronamespace = 'public'::regnamespace and f.proname = 'browse_instructors';
  if v_args && array['phone', 'email', 'mbti', 'past_centers', 'students_taught', 'languages', 'other_certs']
  then
    raise exception 'browse_returns_only_public_active_no_contacts 실패 (반환 칸 %)', v_args;
  end if;

  update public.profiles set account_status = 'banned' where id = 'f9000000-0000-4000-8000-0000000000a3';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);

  select count(*) into n from public.browse_instructors('{}'::jsonb, 50, 0) b
    where b.user_id in ('f9000000-0000-4000-8000-0000000000a2', 'f9000000-0000-4000-8000-0000000000a3',
                        'f9000000-0000-4000-8000-0000000000c1', 'f9000000-0000-4000-8000-0000000000c2');
  if n <> 0 then raise exception 'browse_returns_only_public_active_no_contacts 실패 (비공개·퇴출·센터 %행)', n; end if;

  select count(*) into n from public.browse_instructors('{}'::jsonb, 50, 0) b
    where b.user_id in ('f9000000-0000-4000-8000-0000000000a1', 'f9000000-0000-4000-8000-0000000000a4',
                        'f9000000-0000-4000-8000-0000000000a5');
  if n <> 3 then raise exception 'browse_returns_only_public_active_no_contacts 실패 (공개 강사 %행)', n; end if;

  select b.intro, b.facts into v_intro, v_facts from public.browse_instructors('{}'::jsonb, 50, 0) b
    where b.user_id = 'f9000000-0000-4000-8000-0000000000a1';
  if char_length(v_intro) <> 200 then
    raise exception 'browse_returns_only_public_active_no_contacts 실패 (소개 %자)', char_length(v_intro);
  end if;
  if not (v_facts @> '[{"doc_type":"instructor_cert","org":"AIDA"}]'::jsonb) then
    raise exception 'browse_returns_only_public_active_no_contacts 실패 (서류 사실 %)', v_facts;
  end if;
  if v_facts::text ~ '(cert\.jpg|file_path|reject)' then
    raise exception 'browse_returns_only_public_active_no_contacts 실패 (서류 원본 정보 %)', v_facts;
  end if;

  -- 필터
  select count(*) into n from public.browse_instructors('{"verified_only":true}'::jsonb, 50, 0) b
    where b.user_id in ('f9000000-0000-4000-8000-0000000000a1', 'f9000000-0000-4000-8000-0000000000a5');
  if n <> 1 then raise exception 'browse_returns_only_public_active_no_contacts 실패 (서류 확인만 %행)', n; end if;
  select count(*) into n from public.browse_instructors('{"regions":["부산"]}'::jsonb, 50, 0) b
    where b.user_id = 'f9000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'browse_returns_only_public_active_no_contacts 실패 (지역 필터 %행)', n; end if;
  select count(*) into n from public.browse_instructors('{"regions":["부산","서울"]}'::jsonb, 50, 0) b
    where b.user_id = 'f9000000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'browse_returns_only_public_active_no_contacts 실패 (지역 겹침 %행)', n; end if;
  select count(*) into n from public.browse_instructors('{"org":"aida"}'::jsonb, 50, 0) b
    where b.user_id in ('f9000000-0000-4000-8000-0000000000a1', 'f9000000-0000-4000-8000-0000000000a4');
  if n <> 1 then raise exception 'browse_returns_only_public_active_no_contacts 실패 (단체 필터 %행)', n; end if;
  select count(*) into n from public.browse_instructors('{"scope":"sea"}'::jsonb, 50, 0) b
    where b.user_id = 'f9000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'browse_returns_only_public_active_no_contacts 실패 (활동 범위 필터 %행)', n; end if;
  select count(*) into n from public.browse_instructors('{"available_days":["월"]}'::jsonb, 50, 0) b
    where b.user_id = 'f9000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'browse_returns_only_public_active_no_contacts 실패 (요일 필터 %행)', n; end if;
  reset role;

  update public.profiles set account_status = 'active' where id = 'f9000000-0000-4000-8000-0000000000a3';
end $$;

-- ---------------------------------------------------------------------
-- offer_limits:
--   비공개 강사 · 정지/퇴출 강사 · 마감 공고 · 남의 공고 · 이미 지원한 강사 · 한마디 200자 초과 · 비로그인 거부.
--   I1에게 J2로 보내기 성공 → 같은 제안 다시 거부 → 철회(남·강사 거부, 주인만) → 철회 뒤에도 다시 거부.
--   제안 받은(보냄) 강사는 그 공고에 지원할 수 없다. 공고당 한도(인원 × 5) 초과 거부.
--   직접 쓰기(insert·update) 거부.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_blocked boolean;
  v_msg text;
  v_status text;
  v_offer uuid;
begin
  -- I4는 J2에 지원해 둔다
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  perform public.apply_to_job(current_setting('p3o.j2')::uuid, '지원합니다');

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);

  -- 비공개 강사
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a2', null);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (비공개 강사)'; end if;

  -- 마감된 공고
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.jc')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (마감된 공고)'; end if;

  -- 이미 지원한 강사
  v_msg := null;
  begin
    perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a4', null);
  exception when invalid_parameter_value then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from '이미 지원한 강사예요' then
    raise exception 'offer_limits 실패 (이미 지원한 강사: %)', coalesce(v_msg, '통과');
  end if;

  -- 나 자신 · 강사가 아닌 계정(센터 C2)
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000c2', null);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (센터에게 제안)'; end if;

  -- 한마디 200자 초과
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a1', repeat('가', 201));
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (한마디 201자)'; end if;

  -- 남의 공고(C2가 C1 공고로)
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (남의 공고)'; end if;

  -- 강사는 제안할 수 없다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (강사가 제안)'; end if;
  reset role;

  -- 정지·퇴출 강사
  foreach v_status in array array['banned', 'suspended'] loop
    update public.profiles set account_status = v_status where id = 'f9000000-0000-4000-8000-0000000000a3';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
    v_blocked := false;
    begin
      perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a3', null);
    exception when invalid_parameter_value then
      v_blocked := true;
    end;
    reset role;
    if not v_blocked then raise exception 'offer_limits 실패 (% 강사)', v_status; end if;
  end loop;
  update public.profiles set account_status = 'active' where id = 'f9000000-0000-4000-8000-0000000000a3';

  -- 비로그인
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'offer_limits 실패 (비로그인)'; end if;

  -- 성공 → 중복 거부
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_offer := public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a1', '함께해요');
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  exception when unique_violation then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (같은 제안 두 번)'; end if;

  -- 직접 쓰기 거부(권한 없음)
  v_blocked := false;
  begin
    insert into public.job_offers (job_id, center_id, instructor_id)
    select current_setting('p3o.j4')::uuid, c.id, 'f9000000-0000-4000-8000-0000000000a4'
    from public.centers c where c.owner_user_id = 'f9000000-0000-4000-8000-0000000000c1';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (센터 직접 insert)'; end if;

  -- 제안 받은 강사는 그 공고에 지원할 수 없다 · 직접 수정도 못 한다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(current_setting('p3o.j2')::uuid, null);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (제안 받은 공고에 지원)'; end if;
  v_blocked := false;
  begin
    update public.job_offers set status = 'accepted' where id = v_offer;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (강사 직접 update)'; end if;

  -- 철회: 강사·남의 센터 거부, 주인만
  v_blocked := false;
  begin
    perform public.withdraw_offer(v_offer);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (강사가 철회)'; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.withdraw_offer(v_offer);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (남의 센터가 철회)'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.withdraw_offer(v_offer);
  v_blocked := false;
  begin
    perform public.withdraw_offer(v_offer);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (두 번 철회)'; end if;
  -- 철회 뒤에도 같은 공고·같은 강사에게 다시 못 보낸다
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j2')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  exception when unique_violation then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'offer_limits 실패 (철회 뒤 다시 제안)'; end if;
  reset role;

  select count(*) into n from public.job_offers where id = v_offer and status = 'withdrawn' and responded_at is not null;
  if n <> 1 then raise exception 'offer_limits 실패 (철회 상태 %행)', n; end if;

  -- 공고당 한도: J4(인원 1) → 5건. 준비로 5건을 직접 넣는다(postgres 세션).
  insert into public.job_offers (job_id, center_id, instructor_id)
  select current_setting('p3o.j4')::uuid, c.id, x.id
  from public.centers c
  cross join (values ('f9000000-0000-4000-8000-0000000000a2'::uuid), ('f9000000-0000-4000-8000-0000000000a3'::uuid),
                     ('f9000000-0000-4000-8000-0000000000a4'::uuid), ('f9000000-0000-4000-8000-0000000000a5'::uuid),
                     ('f9000000-0000-4000-8000-0000000000c2'::uuid)) x(id)
  where c.owner_user_id = 'f9000000-0000-4000-8000-0000000000c1';
  update public.job_offers set status = 'declined', responded_at = now()
  where job_id = current_setting('p3o.j4')::uuid and instructor_id = 'f9000000-0000-4000-8000-0000000000a5';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j4')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'offer_limits 실패 (공고당 한도 초과)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- offer_accept_respects_headcount:
--   J1(인원 1): I1에게 제안 + I5 지원 → I5 선택 → 공고 인원 마감, I1 제안은 마감(expired) → 수락 거부.
--   J6(인원 1): I1에게 제안 + I5 지원 → I1 수락 → 공고 인원 마감, I5 지원은 미선택 → 선택 거부.
--   J5(인원 2): I1 수락 → 모집 중·남은 자리 1 → I4 지원 선택 → 인원 다 참(full)·남은 자리 0.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_blocked boolean;
  v_offer uuid;
  v_app uuid;
  v_status text;
  v_remaining int;
begin
  -- J1: 선택 뒤 수락 거부
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_offer := public.send_offer(current_setting('p3o.j1')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a5', 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(current_setting('p3o.j1')::uuid, null);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.select_applicant(v_app);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.respond_offer(v_offer, true);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'offer_accept_respects_headcount 실패 (선택 뒤 수락)'; end if;
  select o.status into v_status from public.job_offers o where o.id = v_offer;
  if v_status <> 'expired' then
    raise exception 'offer_accept_respects_headcount 실패 (선택으로 마감된 공고의 제안 %)', v_status;
  end if;

  -- J6: 수락 뒤 선택 거부
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_offer := public.send_offer(current_setting('p3o.j6')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  perform set_config('p3o.o6', v_offer::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a5', 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(current_setting('p3o.j6')::uuid, null);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  perform public.respond_offer(v_offer, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.select_applicant(v_app);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  select s.effective_status, s.remaining into v_status, v_remaining
    from public.get_job_summary(current_setting('p3o.j6')::uuid) s;
  reset role;
  if not v_blocked then raise exception 'offer_accept_respects_headcount 실패 (수락 뒤 선택)'; end if;
  if v_status <> 'full' or v_remaining <> 0 then
    raise exception 'offer_accept_respects_headcount 실패 (수락 뒤 공고 % 남은 자리 %)', v_status, v_remaining;
  end if;
  select count(*) into n from public.job_applications where id = v_app and status = 'not_selected';
  if n <> 1 then raise exception 'offer_accept_respects_headcount 실패 (수락으로 마감 뒤 지원 상태)'; end if;

  -- J5(인원 2): 수락 1 → 모집 중·남은 자리 1 → 선택 1 → 인원 참
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_offer := public.send_offer(current_setting('p3o.j5')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(current_setting('p3o.j5')::uuid, null);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  perform public.respond_offer(v_offer, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select s.effective_status, s.remaining into v_status, v_remaining
    from public.get_job_summary(current_setting('p3o.j5')::uuid) s;
  if v_status <> 'open' or v_remaining <> 1 then
    reset role;
    raise exception 'offer_accept_respects_headcount 실패 (수락 1명 뒤 공고 % 남은 자리 %)', v_status, v_remaining;
  end if;
  perform public.select_applicant(v_app);
  select s.effective_status, s.remaining into v_status, v_remaining
    from public.get_job_summary(current_setting('p3o.j5')::uuid) s;
  reset role;
  if v_status <> 'full' or v_remaining <> 0 then
    raise exception 'offer_accept_respects_headcount 실패 (수락 1 + 선택 1 뒤 공고 % 남은 자리 %)', v_status, v_remaining;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- offer_contact_only_owner_accepted:
--   J6 수락한 제안(p3o.o6): 공고 주인 C1만 연락처 1행. 다른 센터 C2 · 강사 I1 0행, 비로그인 거부.
--   수락 전(보냄) 제안은 주인도 0행. 유료 전환 구독 없는 C1 · 퇴출 강사 · 퇴출 C1이면 0행.
--   직접 조회: C1·I1·관리자는 행을 보고 C2는 못 본다. 구독 없는 C1은 못 본다.
--   수락한 강사가 이력서를 비공개로 돌려도 C1은 이력서를 보고 C2는 못 본다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_phone text;
  v_blocked boolean;
  v_pending uuid;
  v_offer uuid := current_setting('p3o.o6')::uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select c.phone into v_phone from public.get_offer_contact(v_offer) c;
  if v_phone is distinct from '010-9000-0011' then
    raise exception 'offer_contact_only_owner_accepted 실패 (주인 연락처 %)', v_phone;
  end if;
  -- 수락 전(보냄) 제안: J7로 보내 두고 주인도 0행
  v_pending := public.send_offer(current_setting('p3o.j7')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  perform set_config('p3o.o7', v_pending::text, true);
  select count(*) into n from public.get_offer_contact(v_pending);
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (수락 전 %행)', n; end if;
  select count(*) into n from public.job_offers where id = v_offer;
  if n <> 1 then raise exception 'offer_contact_only_owner_accepted 실패 (주인 직접 조회 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_offer_contact(v_offer);
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (다른 센터 %행)', n; end if;
  select count(*) into n from public.job_offers where id = v_offer;
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (다른 센터 직접 조회 %행)', n; end if;
  select count(*) into n from public.private_contacts where user_id = 'f9000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (다른 센터 연락처 표 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_offer_contact(v_offer);
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (강사 %행)', n; end if;
  select count(*) into n from public.job_offers where id = v_offer;
  if n <> 1 then raise exception 'offer_contact_only_owner_accepted 실패 (강사 직접 조회 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_offers where id = v_offer;
  if n <> 1 then raise exception 'offer_contact_only_owner_accepted 실패 (관리자 직접 조회 %행)', n; end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_blocked := false;
  begin
    perform * from public.get_offer_contact(v_offer);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  begin
    select count(*) into n from public.job_offers;
  exception when insufficient_privilege then
    n := 0;
  end;
  reset role;
  if not v_blocked then raise exception 'offer_contact_only_owner_accepted 실패 (비로그인 연락처)'; end if;
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (비로그인 직접 조회 %행)', n; end if;

  -- 수락한 강사가 비공개로 돌려도 C1은 이력서를 본다(C2는 못 본다)
  update public.talent_profiles set is_public = false where user_id = 'f9000000-0000-4000-8000-0000000000a1';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.talent_profiles where user_id = 'f9000000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'offer_contact_only_owner_accepted 실패 (수락 강사 이력서 C1 %행)', n; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.talent_profiles where user_id = 'f9000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (수락 강사 이력서 C2 %행)', n; end if;
  reset role;
  update public.talent_profiles set is_public = true where user_id = 'f9000000-0000-4000-8000-0000000000a1';

  -- 유료 전환 + 구독 없는 C1
  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_offer_contact(v_offer);
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (구독 없는 주인 %행)', n; end if;
  select count(*) into n from public.job_offers where id = v_offer;
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (구독 없는 주인 직접 조회 %행)', n; end if;
  reset role;
  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

  -- 퇴출된 강사 · 퇴출된 주인
  update public.profiles set account_status = 'banned' where id = 'f9000000-0000-4000-8000-0000000000a1';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_offer_contact(v_offer);
  reset role;
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (퇴출 강사 %행)', n; end if;
  update public.profiles set account_status = 'active' where id = 'f9000000-0000-4000-8000-0000000000a1';

  update public.profiles set account_status = 'banned' where id = 'f9000000-0000-4000-8000-0000000000c1';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_offer_contact(v_offer);
  reset role;
  if n <> 0 then raise exception 'offer_contact_only_owner_accepted 실패 (퇴출 주인 %행)', n; end if;
  update public.profiles set account_status = 'active' where id = 'f9000000-0000-4000-8000-0000000000c1';
end $$;

-- ---------------------------------------------------------------------
-- accept_requires_talent_product_in_paid_mode:
--   J7 제안(p3o.o7, 보냄): 유료 전환 뒤 구독 없는 I1은 수락 거부, 제안은 그대로 '보냄'.
-- decline_always_allowed:
--   같은 상황(유료 전환·구독 없음)에서도 거절은 된다 → '거절', 거절 뒤 같은 제안 다시 보내기 거부.
--   남의 제안에는 답할 수 없다(I4).
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean;
  v_status text;
  v_offer uuid := current_setting('p3o.o7')::uuid;
begin
  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.respond_offer(v_offer, true);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'accept_requires_talent_product_in_paid_mode 실패 (구독 없이 수락)'; end if;
  select o.status into v_status from public.job_offers o where o.id = v_offer;
  if v_status <> 'offered' then
    raise exception 'accept_requires_talent_product_in_paid_mode 실패 (거부 뒤 상태 %)', v_status;
  end if;

  -- 남의 제안
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.respond_offer(v_offer, false);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'decline_always_allowed 실패 (남의 제안 거절)'; end if;

  -- 구독 없이도 거절
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  perform public.respond_offer(v_offer, false);
  reset role;
  select o.status into v_status from public.job_offers o where o.id = v_offer and o.responded_at is not null;
  if v_status is distinct from 'declined' then
    raise exception 'decline_always_allowed 실패 (거절 뒤 상태 %)', v_status;
  end if;

  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

  -- 거절 뒤 다시 보내기 거부
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.send_offer(current_setting('p3o.j7')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  exception when unique_violation then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'decline_always_allowed 실패 (거절 뒤 다시 제안)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- close_expires_offers:
--   J9 직접 마감(close_job_post) → 보냄 제안은 마감(expired). J10 기한 지남 → expire_jobs → 마감(expired).
--   마감된 제안은 수락할 수 없다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_blocked boolean;
  v_o9 uuid;
  v_o10 uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_o9 := public.send_offer(current_setting('p3o.j9')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  v_o10 := public.send_offer(current_setting('p3o.j10')::uuid, 'f9000000-0000-4000-8000-0000000000a1', null);
  perform public.close_job_post(current_setting('p3o.j9')::uuid);
  reset role;

  select count(*) into n from public.job_offers where id = v_o9 and status = 'expired' and responded_at is not null;
  if n <> 1 then raise exception 'close_expires_offers 실패 (직접 마감 뒤 제안)'; end if;

  -- 기한 지남: 마감일을 어제로(준비용 직접 수정)
  update public.job_posts set deadline = v_today - 1 where id = current_setting('p3o.j10')::uuid;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.expire_jobs();
  reset role;
  select count(*) into n from public.job_offers where id = v_o10 and status = 'expired' and responded_at is not null;
  if n <> 1 then raise exception 'close_expires_offers 실패 (기한 지남 뒤 제안)'; end if;
  select count(*) into n from public.job_posts
    where id = current_setting('p3o.j10')::uuid and status = 'closed' and closed_reason = 'expired';
  if n <> 1 then raise exception 'close_expires_offers 실패 (기한 지난 공고 상태)'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.respond_offer(v_o9, true);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'close_expires_offers 실패 (마감된 제안 수락)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- self_offer_refused:
--   관리자 A(강사 + 센터, 공개 이력서·온보딩 끝 — 자기도 제안 대상 조건을 다 갖춤)가 자기 공고 JD로
--   자기에게 제안 → 거부(22023), 제안 행 없음. 대조군: 같은 공고로 I5에게는 보낼 수 있다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_msg text;
  v_jd uuid := current_setting('p3o.jd')::uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  v_msg := null;
  begin
    perform public.send_offer(v_jd, 'f9000000-0000-4000-8000-0000000000d1', null);
  exception when invalid_parameter_value then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from '제안할 수 있는 강사가 아니에요' then
    reset role;
    raise exception 'self_offer_refused 실패 (자기에게 제안: %)', coalesce(v_msg, '통과');
  end if;
  perform public.send_offer(v_jd, 'f9000000-0000-4000-8000-0000000000a5', null);
  reset role;

  select count(*) into n from public.job_offers
    where job_id = v_jd and instructor_id = 'f9000000-0000-4000-8000-0000000000d1';
  if n <> 0 then raise exception 'self_offer_refused 실패 (자기 제안 %행)', n; end if;
  select count(*) into n from public.job_offers
    where job_id = v_jd and instructor_id = 'f9000000-0000-4000-8000-0000000000a5';
  if n <> 1 then raise exception 'self_offer_refused 실패 (대조군 제안 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- update_headcount_counts_accepted_offer:
--   J11(인원 3): I1 제안 수락 + I4 지원 선택 = 2명. 공고 수정으로 인원을 1로 줄이기 → 거부(22023, 2명 안내),
--   공고는 그대로(인원 3·모집 중). 인원을 2로 줄이기 → 성공하고 그 자리에서 인원 마감(closed/full).
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_msg text;
  v_offer uuid;
  v_app uuid;
  v_j11 uuid := current_setting('p3o.j11')::uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'job_type', 'lesson', 'title', '제안 공고 j11', 'region', '서울',
    'class_date', v_today + 10, 'description', '제안 설명', 'deadline', v_today + 9);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_offer := public.send_offer(v_j11, 'f9000000-0000-4000-8000-0000000000a1', null);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  perform public.respond_offer(v_offer, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000a4', 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(v_j11, null);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.select_applicant(v_app);

  -- 1명으로 줄이기: 선택 1 + 수락 1 = 2명보다 적어서 거부
  v_msg := null;
  begin
    perform public.update_job_post(v_j11, v_payload || jsonb_build_object('headcount', 1));
  exception when invalid_parameter_value then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from '이미 선택·수락한 인원(2명)보다 적게 줄일 수 없어요' then
    reset role;
    raise exception 'update_headcount_counts_accepted_offer 실패 (1명으로 줄이기: %)', coalesce(v_msg, '통과');
  end if;
  reset role;
  select count(*) into n from public.job_posts where id = v_j11 and headcount = 3 and status = 'open';
  if n <> 1 then raise exception 'update_headcount_counts_accepted_offer 실패 (거부 뒤 공고가 바뀜)'; end if;

  -- 2명으로 줄이기: 같으면 인원 마감
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  perform public.update_job_post(v_j11, v_payload || jsonb_build_object('headcount', 2));
  reset role;
  select count(*) into n from public.job_posts
    where id = v_j11 and headcount = 2 and status = 'closed' and closed_reason = 'full';
  if n <> 1 then raise exception 'update_headcount_counts_accepted_offer 실패 (같게 줄인 뒤 인원 마감)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- accepted_private_instructor_name_and_facts:
--   I1(C1의 제안을 수락, C1 공고에 지원한 적 없음)이 이력서를 비공개로 돌려도
--   C1은 이름(can_view_profile)과 강사 서류 사실(get_public_facts)을 본다.
--   다른 센터 C2 · 다른 강사 I4는 못 본다(거짓 · 0행).
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_can boolean;
  v_user uuid;
  i1 uuid := 'f9000000-0000-4000-8000-0000000000a1';
begin
  select count(*) into n from public.job_applications a
    join public.job_posts j on j.id = a.job_id
    where a.instructor_id = i1 and j.owner_id = 'f9000000-0000-4000-8000-0000000000c1';
  if n <> 0 then raise exception 'accepted_private_instructor_name_and_facts 실패 (전제: I1이 C1 공고에 지원 %건)', n; end if;

  update public.talent_profiles set is_public = false where user_id = i1;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f9000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select public.can_view_profile(i1) into v_can;
  select count(*) into n from public.get_public_facts(i1) f where f.doc_type = 'instructor_cert';
  reset role;
  if not v_can or n <> 1 then
    raise exception 'accepted_private_instructor_name_and_facts 실패 (C1 이름 % 사실 %행)', v_can, n;
  end if;

  foreach v_user in array array['f9000000-0000-4000-8000-0000000000c2', 'f9000000-0000-4000-8000-0000000000a4']::uuid[] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    select public.can_view_profile(i1) into v_can;
    select count(*) into n from public.get_public_facts(i1);
    reset role;
    if v_can or n <> 0 then
      raise exception 'accepted_private_instructor_name_and_facts 실패 (% 이름 % 사실 %행)', v_user, v_can, n;
    end if;
  end loop;

  update public.talent_profiles set is_public = true where user_id = i1;
end $$;

rollback;

select 'offers ok' as result;
