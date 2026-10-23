-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)의 SQL Editor에서 실행 — 워너다이브 프로젝트에서 실행하지 말 것
-- =====================================================================
-- 아쿠아잡 012 관리자 조치 후속 검사 (개발/테스트 전용) — 012 적용 후 실행
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다(알림·발송 대기열도 함께 되돌아간다).
-- 성공하면 마지막에 'moderation2 ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
--
-- 검사 사이에 만든 공고 id는 트랜잭션 설정값(p3u.*)에 담아 넘긴다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자
--   C1 = fc000000-0000-4000-8000-0000000000c1 (센터, 사업자등록증 확인 — 공고 u1 u2 u3 u4)
--   C2 = fc000000-0000-4000-8000-0000000000c2 (센터, 사업자등록증 확인 — 공고 u5, 주인 비활성 검사)
--   I1 = fc000000-0000-4000-8000-0000000000a1 (강사, 공개 이력서 — 지원자 · 관리자 아닌 회원)
--   I2 = fc000000-0000-4000-8000-0000000000a2 (강사, 공개 이력서 — 제안 받는 사람)
--   D1 = fc000000-0000-4000-8000-0000000000d1 (관리자 + 강사)
--   D2 = fc000000-0000-4000-8000-0000000000d2 (다른 관리자 + 강사 — 정지된 관리자 검사)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'p3u-c1@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"보임센터1","phone":"010-9300-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-0000000000c2',
   'authenticated', 'authenticated', 'p3u-c2@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"보임센터2","phone":"010-9300-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'p3u-i1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"보임강사1","phone":"010-9300-0011"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'p3u-i2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"보임강사2","phone":"010-9300-0012"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'p3u-d1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"보임관리자1"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-0000000000d2',
   'authenticated', 'authenticated', 'p3u-d2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"보임관리자2"}', now(), now());

update public.profiles set roles = array['admin', 'instructor'], role = 'admin'
  where id in ('fc000000-0000-4000-8000-0000000000d1', 'fc000000-0000-4000-8000-0000000000d2');

-- 무료 기간에서 시작한다(운영 값이 무엇이든 이 트랜잭션 안에서만)
update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

insert into public.talent_profiles (user_id, is_public, onboarding_done, regions, scopes, available_days, intro)
values
  ('fc000000-0000-4000-8000-0000000000a1', true, true, array['서울'], array['pool'], array['토'], '보임1'),
  ('fc000000-0000-4000-8000-0000000000a2', true, true, array['서울'], array['pool'], array['토'], '보임2');

insert into public.verification_documents (id, owner_id, doc_type, file_path, meta) values
  ('fcd00000-0000-4000-8000-0000000000c1', 'fc000000-0000-4000-8000-0000000000c1',
   'business_registration', 'fc000000-0000-4000-8000-0000000000c1/biz.jpg', '{}'),
  ('fcd00000-0000-4000-8000-0000000000c2', 'fc000000-0000-4000-8000-0000000000c2',
   'business_registration', 'fc000000-0000-4000-8000-0000000000c2/biz.jpg', '{}');

-- 공고 준비(모두 lesson, 수업일 +10, 마감 +9)
--   C1: u1 인원 2 (모집 중으로 돌아옴) · u2 인원 1 (선택으로 다 참 → 마감 full) · u3 인원 1 (기간 지남 → expired)
--       · u4 인원 1 (직접 마감 manual → 그대로)
--   C2: u5 인원 1 (주인 정지 → 거부)
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_key text;
  v_owner text;
  v_head int;
  v_id uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fc000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('fcd00000-0000-4000-8000-0000000000c1', 'verified', null, null);
  perform public.review_document('fcd00000-0000-4000-8000-0000000000c2', 'verified', null, null);

  for v_key, v_owner, v_head in
    select * from (values
      ('u1', 'fc000000-0000-4000-8000-0000000000c1', 2), ('u2', 'fc000000-0000-4000-8000-0000000000c1', 1),
      ('u3', 'fc000000-0000-4000-8000-0000000000c1', 1), ('u4', 'fc000000-0000-4000-8000-0000000000c1', 1),
      ('u5', 'fc000000-0000-4000-8000-0000000000c2', 1)
    ) v(k, o, h)
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    v_id := public.create_job_post(jsonb_build_object(
      'job_type', 'lesson', 'title', '보임 공고 ' || v_key, 'region', '서울',
      'class_date', v_today + 10, 'headcount', v_head, 'description', '보임 설명', 'deadline', v_today + 9));
    perform set_config('p3u.' || v_key, v_id::text, true);
  end loop;
  reset role;
end $$;

-- 숨기기 전 상태 만들기 → 관리자 D1이 다섯 공고를 모두 숨긴다
--   u1: I1 지원(남은 지원 → 숨길 때 미선택) · I2에게 제안(보냄 → 숨길 때 마감)
--   u2: I1 지원 → C1이 선택(인원 1 다 참 → 자동 마감 full)
--   u3: 마감일·수업일을 지난 날로(준비용 직접 수정)
--   u4: C1이 직접 마감(manual)
do $$
declare
  c1 uuid := 'fc000000-0000-4000-8000-0000000000c1';
  i1 uuid := 'fc000000-0000-4000-8000-0000000000a1';
  i2 uuid := 'fc000000-0000-4000-8000-0000000000a2';
  d1 uuid := 'fc000000-0000-4000-8000-0000000000d1';
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_app uuid;
  v_app2 uuid;
  v_offer uuid;
  v_key text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(current_setting('p3u.u1')::uuid, null);
  v_app2 := public.apply_to_job(current_setting('p3u.u2')::uuid, null);
  perform set_config('p3u.app1', v_app::text, true);

  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_offer := public.send_offer(current_setting('p3u.u1')::uuid, i2, null);
  perform set_config('p3u.offer1', v_offer::text, true);
  perform public.select_applicant(v_app2);
  perform public.close_job_post(current_setting('p3u.u4')::uuid);
  reset role;

  update public.job_posts set deadline = v_today - 2, class_date = v_today - 1
    where id = current_setting('p3u.u3')::uuid;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  foreach v_key in array array['u1', 'u2', 'u3', 'u4', 'u5'] loop
    perform public.admin_hide_job(current_setting('p3u.' || v_key)::uuid, 'false_posting', null);
  end loop;
  reset role;

  if (select status from public.job_applications where id = v_app) <> 'not_selected' then
    raise exception 'setup 실패 (숨길 때 지원이 미선택이 안 됨)';
  end if;
  if (select status from public.job_offers where id = v_offer) <> 'expired' then
    raise exception 'setup 실패 (숨길 때 제안이 마감이 안 됨)';
  end if;
  if (select closed_reason from public.job_posts where id = current_setting('p3u.u2')::uuid) is distinct from 'full' then
    raise exception 'setup 실패 (u2 자동 마감 full 아님)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- unhide_admin_only: 관리자 아닌 회원(I1) · 공고 주인(C1) · 정지된 관리자(D2) · 비로그인은 다시 보이게 할 수 없다.
--   아무것도 바뀌지 않는다(공고 hidden 그대로, 관리자 기록·알림 없음).
-- ---------------------------------------------------------------------
do $$
declare
  v_u1 uuid := current_setting('p3u.u1')::uuid;
  v_user text;
  v_blocked boolean;
  n int;
begin
  update public.profiles set account_status = 'suspended' where id = 'fc000000-0000-4000-8000-0000000000d2';

  foreach v_user in array array[
    'fc000000-0000-4000-8000-0000000000a1',
    'fc000000-0000-4000-8000-0000000000c1',
    'fc000000-0000-4000-8000-0000000000d2'
  ] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    v_blocked := false;
    begin
      perform public.admin_unhide_job(v_u1, null);
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    reset role;
    if not v_blocked then raise exception 'unhide_admin_only 실패 (%)', v_user; end if;
  end loop;

  update public.profiles set account_status = 'active' where id = 'fc000000-0000-4000-8000-0000000000d2';

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_blocked := false;
  begin
    perform public.admin_unhide_job(v_u1, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'unhide_admin_only 실패 (비로그인)'; end if;

  select count(*) into n from public.job_posts where id = v_u1 and status = 'hidden';
  if n <> 1 then raise exception 'unhide_admin_only 실패 (공고 상태가 바뀜)'; end if;
  select count(*) into n from public.admin_actions where target_job_id = v_u1 and action = 'job_unhidden';
  if n <> 0 then raise exception 'unhide_admin_only 실패 (관리자 기록 %행)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = 'fc000000-0000-4000-8000-0000000000c1' and kind = 'job_unhidden';
  if n <> 0 then raise exception 'unhide_admin_only 실패 (알림 %건)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- unhide_self_or_admin_owner_refused:
--   C1을 잠깐 관리자로 만들면 — C1 자신이 내 공고를(42501), D1이 관리자 계정(C1)의 공고를(42501) 다시 보이게 할 수 없다.
-- ---------------------------------------------------------------------
do $$
declare
  v_u1 uuid := current_setting('p3u.u1')::uuid;
  v_user text;
  v_blocked boolean;
begin
  update public.profiles set roles = array['center', 'admin'] where id = 'fc000000-0000-4000-8000-0000000000c1';

  foreach v_user in array array['fc000000-0000-4000-8000-0000000000c1', 'fc000000-0000-4000-8000-0000000000d1'] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    v_blocked := false;
    begin
      perform public.admin_unhide_job(v_u1, null);
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    reset role;
    if not v_blocked then raise exception 'unhide_self_or_admin_owner_refused 실패 (%)', v_user; end if;
  end loop;

  update public.profiles set roles = array['center'], role = 'center' where id = 'fc000000-0000-4000-8000-0000000000c1';
  if (select status from public.job_posts where id = v_u1) <> 'hidden' then
    raise exception 'unhide_self_or_admin_owner_refused 실패 (공고 상태가 바뀜)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- unhide_inactive_owner_refused: 공고 주인 C2가 정지면 거부(42501), 다시 활성으로 바꾸면 된다.
--   없는 공고는 P0002, 설명 501자는 22023.
-- ---------------------------------------------------------------------
do $$
declare
  c2 uuid := 'fc000000-0000-4000-8000-0000000000c2';
  d1 uuid := 'fc000000-0000-4000-8000-0000000000d1';
  v_u5 uuid := current_setting('p3u.u5')::uuid;
  v_blocked boolean;
  v_status text;
begin
  update public.profiles set account_status = 'suspended' where id = c2;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.admin_unhide_job(v_u5, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'unhide_inactive_owner_refused 실패 (정지된 주인)'; end if;

  v_blocked := false;
  begin
    perform public.admin_unhide_job(gen_random_uuid(), null);
  exception when no_data_found then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'unhide_inactive_owner_refused 실패 (없는 공고)'; end if;

  v_blocked := false;
  begin
    perform public.admin_unhide_job(v_u5, repeat('가', 501));
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'unhide_inactive_owner_refused 실패 (설명 501자)'; end if;
  reset role;

  update public.profiles set account_status = 'active' where id = c2;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  v_status := public.admin_unhide_job(v_u5, null);
  reset role;
  if v_status is distinct from 'open' then
    raise exception 'unhide_inactive_owner_refused 실패 (다시 활성 뒤 %)', coalesce(v_status, 'null');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- unhide_restore_status:
--   u1 → open(지원·제안은 되돌리지 않음: 지원 미선택, 제안 마감 그대로)
--   u2 → closed/full (인원 다 참, 숨기기 전 마감 그대로) · u3 → closed/expired (기간 지남) · u4 → closed/manual
--   관리자 기록 'job_unhidden'(설명), 공고 주인 알림 'job_unhidden' 공고마다 하나, 다시 보임에 '숨김' 알림 없음,
--   지원자·제안 받은 강사에게 새 알림 없음. 이미 보이는 공고는 22023.
-- ---------------------------------------------------------------------
do $$
declare
  c1 uuid := 'fc000000-0000-4000-8000-0000000000c1';
  i1 uuid := 'fc000000-0000-4000-8000-0000000000a1';
  i2 uuid := 'fc000000-0000-4000-8000-0000000000a2';
  d1 uuid := 'fc000000-0000-4000-8000-0000000000d1';
  v_u1 uuid := current_setting('p3u.u1')::uuid;
  v_u2 uuid := current_setting('p3u.u2')::uuid;
  v_u3 uuid := current_setting('p3u.u3')::uuid;
  v_u4 uuid := current_setting('p3u.u4')::uuid;
  v_hidden_before int;
  v_i1_before int;
  v_i2_before int;
  v_s1 text;
  v_s2 text;
  v_s3 text;
  v_s4 text;
  v_blocked boolean;
  n int;
begin
  select count(*) into v_hidden_before from public.aqua_notifications where user_id = c1 and kind = 'job_hidden';
  select count(*) into v_i1_before from public.aqua_notifications where user_id = i1;
  select count(*) into v_i2_before from public.aqua_notifications where user_id = i2;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  v_s1 := public.admin_unhide_job(v_u1, '신고 내용 확인 결과 문제없음');
  v_s2 := public.admin_unhide_job(v_u2, null);
  v_s3 := public.admin_unhide_job(v_u3, null);
  v_s4 := public.admin_unhide_job(v_u4, null);

  -- 이미 보이는 공고
  v_blocked := false;
  begin
    perform public.admin_unhide_job(v_u1, null);
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'unhide_restore_status 실패 (숨기지 않은 공고)'; end if;

  if v_s1 <> 'open' or v_s2 <> 'closed' or v_s3 <> 'closed' or v_s4 <> 'closed' then
    raise exception 'unhide_restore_status 실패 (돌려준 상태 % % % %)', v_s1, v_s2, v_s3, v_s4;
  end if;
  select count(*) into n from public.job_posts where id = v_u1 and status = 'open' and closed_reason is null;
  if n <> 1 then raise exception 'unhide_restore_status 실패 (u1 open)'; end if;
  select count(*) into n from public.job_posts where id = v_u2 and status = 'closed' and closed_reason = 'full';
  if n <> 1 then raise exception 'unhide_restore_status 실패 (u2 full)'; end if;
  select count(*) into n from public.job_posts where id = v_u3 and status = 'closed' and closed_reason = 'expired';
  if n <> 1 then raise exception 'unhide_restore_status 실패 (u3 expired)'; end if;
  select count(*) into n from public.job_posts where id = v_u4 and status = 'closed' and closed_reason = 'manual';
  if n <> 1 then raise exception 'unhide_restore_status 실패 (u4 manual)'; end if;

  -- 지원·제안은 되돌리지 않는다
  select count(*) into n from public.job_applications
    where id = current_setting('p3u.app1')::uuid and status = 'not_selected';
  if n <> 1 then raise exception 'unhide_restore_status 실패 (지원이 되돌아옴)'; end if;
  select count(*) into n from public.job_offers
    where id = current_setting('p3u.offer1')::uuid and status = 'expired';
  if n <> 1 then raise exception 'unhide_restore_status 실패 (제안이 되돌아옴)'; end if;

  -- 관리자 기록
  select count(*) into n from public.admin_actions
    where admin_id = d1 and target_user_id = c1 and action = 'job_unhidden' and target_job_id = v_u1
      and reason is null and note = '신고 내용 확인 결과 문제없음';
  if n <> 1 then raise exception 'unhide_restore_status 실패 (관리자 기록 %행)', n; end if;
  select count(*) into n from public.admin_actions
    where target_user_id = c1 and action = 'job_unhidden' and target_job_id in (v_u1, v_u2, v_u3, v_u4);
  if n <> 4 then raise exception 'unhide_restore_status 실패 (관리자 기록 합계 %행)', n; end if;

  -- 공고 주인 알림: 공고마다 하나, 모집 중/마감 문구
  select count(*) into n from public.aqua_notifications
    where user_id = c1 and kind = 'job_unhidden' and title = '공고가 다시 보여요'
      and body = '보임 공고 u1 · 모집 중으로 돌아왔어요' and link = '/?tab=jobs&job=' || v_u1;
  if n <> 1 then raise exception 'unhide_restore_status 실패 (u1 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = c1 and kind = 'job_unhidden' and body = '보임 공고 u3 · 마감 상태로 돌아왔어요';
  if n <> 1 then raise exception 'unhide_restore_status 실패 (u3 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications where user_id = c1 and kind = 'job_unhidden';
  if n <> 4 then raise exception 'unhide_restore_status 실패 (주인 알림 합계 %건)', n; end if;
  select count(*) into n from public.aqua_notifications where user_id = c1 and kind = 'job_hidden';
  if n <> v_hidden_before then raise exception 'unhide_restore_status 실패 (다시 보임에 숨김 알림)'; end if;

  -- 지원자·제안 받은 강사에게는 새 알림 없음
  select count(*) into n from public.aqua_notifications where user_id = i1;
  if n <> v_i1_before then raise exception 'unhide_restore_status 실패 (지원자 알림 %건 늘어남)', n - v_i1_before; end if;
  select count(*) into n from public.aqua_notifications where user_id = i2;
  if n <> v_i2_before then raise exception 'unhide_restore_status 실패 (제안 강사 알림 %건 늘어남)', n - v_i2_before; end if;

  -- 다시 보인 u1은 공개 요약에 나온다
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i2, 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_job_summary(v_u1);
  reset role;
  if n <> 1 then raise exception 'unhide_restore_status 실패 (공개 요약 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- reactivation_notice:
--   I2 정지 → 다시 활성: I2에게 'account_reactivated' 정확히 하나(quiet_user여도), 다른 사람에게는 없음.
--   I1 퇴출 → 다시 활성: I1에게 하나. 다시 활성 알림 푸시는 일반 문구(기기가 있을 때).
--   함수가 끝나면 조용히 설정값은 비어 있다.
-- ---------------------------------------------------------------------
do $$
declare
  i1 uuid := 'fc000000-0000-4000-8000-0000000000a1';
  i2 uuid := 'fc000000-0000-4000-8000-0000000000a2';
  d1 uuid := 'fc000000-0000-4000-8000-0000000000d1';
  v_total_before int;
  n int;
begin
  -- I2 기기 하나(푸시 문구 확인용, 준비용 직접 insert)
  insert into public.aqua_push_subscriptions (user_id, endpoint, p256dh, auth)
  values (i2, 'https://fcm.googleapis.com/fcm/send/p3u-test-i2', 'p256dh-test', 'auth-test');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  perform public.admin_set_account_status(i2, 'suspended', 'illegal', null);
  reset role;

  select count(*) into v_total_before from public.aqua_notifications where kind = 'account_reactivated';

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  perform public.admin_set_account_status(i2, 'active', null, '확인 끝');
  if coalesce(current_setting('aqua.quiet_user', true), '') <> '' then
    reset role;
    raise exception 'reactivation_notice 실패 (조용히 설정값이 남음)';
  end if;
  reset role;

  select count(*) into n from public.aqua_notifications
    where user_id = i2 and kind = 'account_reactivated' and title = '이용이 다시 가능해졌어요' and link = '/';
  if n <> 1 then raise exception 'reactivation_notice 실패 (I2 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications where kind = 'account_reactivated';
  if n <> v_total_before + 1 then raise exception 'reactivation_notice 실패 (다른 사람에게도 %건)', n - v_total_before; end if;

  select count(*) into n from public.aqua_push_outbox o
    join public.aqua_notifications a on a.id = o.notification_id
    where a.user_id = i2 and a.kind = 'account_reactivated' and o.title = '' and o.body = '앱에서 확인해 주세요';
  if n <> 1 then raise exception 'reactivation_notice 실패 (푸시 일반 문구 %건)', n; end if;

  -- 퇴출 → 다시 활성
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  perform public.admin_set_account_status(i1, 'banned', 'illegal', null);
  perform public.admin_set_account_status(i1, 'active', null, null);
  reset role;
  select count(*) into n from public.aqua_notifications where user_id = i1 and kind = 'account_reactivated';
  if n <> 1 then raise exception 'reactivation_notice 실패 (I1 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications where kind = 'account_reactivated';
  if n <> v_total_before + 2 then raise exception 'reactivation_notice 실패 (전체 %건)', n - v_total_before; end if;
  select count(*) into n from public.aqua_notifications where user_id = d1 and kind = 'account_reactivated';
  if n <> 0 then raise exception 'reactivation_notice 실패 (관리자에게 알림)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- list_reports_target_is_admin:
--   I1이 C1 센터·D1 계정(관리자, 공개 이력서)·u1 공고를 신고 → target_is_admin: 센터 false · D1 true · 공고 false.
--   관리자 아닌 회원 · 정지된 관리자 · 비로그인은 admin_list_reports를 부를 수 없다.
-- ---------------------------------------------------------------------
do $$
declare
  i1 uuid := 'fc000000-0000-4000-8000-0000000000a1';
  d1 uuid := 'fc000000-0000-4000-8000-0000000000d1';
  v_user text;
  v_blocked boolean;
  v_center uuid := (select c.id from public.centers c where c.owner_user_id = 'fc000000-0000-4000-8000-0000000000c1');
  n int;
begin
  -- 신고 준비(준비용 직접 insert — 볼 수 있는지 판정과 상관없이 목록 칸만 본다)
  insert into public.job_reports (reporter_id, target_type, target_id, reason) values
    (i1, 'center', v_center, 'illegal'),
    (i1, 'profile', d1, 'illegal'),
    (i1, 'job', current_setting('p3u.u1')::uuid, 'false_posting');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.admin_list_reports('open') r
    where r.reporter_id = i1 and (
      (r.target_type = 'center' and r.target_id = v_center and r.target_is_admin = false)
      or (r.target_type = 'profile' and r.target_id = d1 and r.target_is_admin = true)
      or (r.target_type = 'job' and r.target_id = current_setting('p3u.u1')::uuid and r.target_is_admin = false
          and r.target_job_status = 'open')
    );
  reset role;
  if n <> 3 then raise exception 'list_reports_target_is_admin 실패 (%행)', n; end if;

  update public.profiles set account_status = 'suspended' where id = 'fc000000-0000-4000-8000-0000000000d2';
  foreach v_user in array array['fc000000-0000-4000-8000-0000000000a1', 'fc000000-0000-4000-8000-0000000000d2'] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    v_blocked := false;
    begin
      perform * from public.admin_list_reports(null);
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    reset role;
    if not v_blocked then raise exception 'list_reports_target_is_admin 실패 (% 목록 조회)', v_user; end if;
  end loop;
  update public.profiles set account_status = 'active' where id = 'fc000000-0000-4000-8000-0000000000d2';

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_blocked := false;
  begin
    perform * from public.admin_list_reports(null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'list_reports_target_is_admin 실패 (비로그인 목록 조회)'; end if;
end $$;

rollback;

select 'moderation2 ok' as result;
