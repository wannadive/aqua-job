-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)에서 실행 — 워너다이브 프로젝트에서 실행하지 말 것
-- =====================================================================
-- 아쿠아잡 010 알림·푸시 검사 (개발/테스트 전용) — 010 적용 후 실행
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다(발송 호출 대기열도 함께 되돌아간다).
-- 성공하면 마지막에 'notify ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
--
-- 검사 사이에 만든 공고·지원·구독 id는 트랜잭션 설정값(p3n.*)에 담아 넘긴다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자. auth.users에 넣으면 가입 트리거가 돈다(→ 센터는 centers 행, 연락처 행도 생긴다).
--   C1 = fa000000-0000-4000-8000-0000000000c1 (센터 '알림센터1', 사업자등록증 확인 — 공고 주인)
--   C2 = fa000000-0000-4000-8000-0000000000c2 (센터 '알림센터2' — 만료 당일 서류, 기기 10대 제한)
--   I1 = fa000000-0000-4000-8000-0000000000a1 (강사, 공개 이력서, 푸시 기기 1대)
--   I2 = fa000000-0000-4000-8000-0000000000a2 (강사, 공개 이력서)
--   A  = fa000000-0000-4000-8000-0000000000d1 (관리자)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'p3n-c1@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"알림센터1","phone":"010-9100-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-4000-8000-0000000000c2',
   'authenticated', 'authenticated', 'p3n-c2@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"알림센터2","phone":"010-9100-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'p3n-i1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"알림강사1","phone":"010-9100-0011"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'p3n-i2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"알림강사2","phone":"010-9100-0012"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'p3n-d@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"알림관리자"}', now(), now());

update public.profiles set roles = array['admin', 'instructor'], role = 'admin'
  where id = 'fa000000-0000-4000-8000-0000000000d1';

-- 무료 기간에서 시작한다(운영 값이 무엇이든 이 트랜잭션 안에서만)
update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

insert into public.talent_profiles (user_id, is_public, onboarding_done, regions, scopes, available_days, intro)
values
  ('fa000000-0000-4000-8000-0000000000a1', true, true, array['서울'], array['pool'], array['토'], '알림1'),
  ('fa000000-0000-4000-8000-0000000000a2', true, true, array['서울'], array['pool'], array['토'], '알림2');

-- 서류(모두 확인 대기로 넣고 관리자가 처리한다)
--   c1  C1 사업자등록증 (확인 → 공고·제안)
--   c4  C1 대표강사 자격증 옛것 (+30일, 먼저 제출) — 새것(c5, +365일)에 밀려 만료 알림 대상 아님
--   c3  C2 대표강사 자격증 (오늘까지)       a1  I1 강사 자격증 (+30일)
--   a3  I1 배상책임보험 (+29일 — 대상 아님)  a2  I2 강사 자격증 (반려)
insert into public.verification_documents (id, owner_id, doc_type, file_path, meta, submitted_at) values
  ('fad00000-0000-4000-8000-0000000000c1', 'fa000000-0000-4000-8000-0000000000c1',
   'business_registration', 'fa000000-0000-4000-8000-0000000000c1/biz.jpg', '{}', now() - interval '3 days'),
  ('fad00000-0000-4000-8000-0000000000c4', 'fa000000-0000-4000-8000-0000000000c1',
   'rep_instructor_cert', 'fa000000-0000-4000-8000-0000000000c1/rep-old.jpg', '{}', now() - interval '2 days'),
  ('fad00000-0000-4000-8000-0000000000c5', 'fa000000-0000-4000-8000-0000000000c1',
   'rep_instructor_cert', 'fa000000-0000-4000-8000-0000000000c1/rep-new.jpg', '{}', now() - interval '1 day'),
  ('fad00000-0000-4000-8000-0000000000c3', 'fa000000-0000-4000-8000-0000000000c2',
   'rep_instructor_cert', 'fa000000-0000-4000-8000-0000000000c2/rep.jpg', '{}', now() - interval '1 day'),
  ('fad00000-0000-4000-8000-0000000000a1', 'fa000000-0000-4000-8000-0000000000a1',
   'instructor_cert', 'fa000000-0000-4000-8000-0000000000a1/cert.jpg', '{"org":"AIDA","grade":"Instructor"}', now() - interval '1 day'),
  ('fad00000-0000-4000-8000-0000000000a3', 'fa000000-0000-4000-8000-0000000000a1',
   'liability_insurance', 'fa000000-0000-4000-8000-0000000000a1/ins.jpg', '{}', now() - interval '1 day'),
  ('fad00000-0000-4000-8000-0000000000a2', 'fa000000-0000-4000-8000-0000000000a2',
   'instructor_cert', 'fa000000-0000-4000-8000-0000000000a2/cert-secret.jpg', '{"org":"AIDA"}', now() - interval '1 day');

-- 서류 확인 · 공고 준비 · I1 기기 등록
--   p3n.j1 (지원 → 선택)  p3n.j2 (제안 → 거절)  p3n.j3 (제안 → 수락)  p3n.j4 (지원 · 제안 → 직접 마감)
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_key text;
  v_id uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fa000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('fad00000-0000-4000-8000-0000000000c1', 'verified', null, null);
  perform public.review_document('fad00000-0000-4000-8000-0000000000c4', 'verified', v_today + 30, null);
  perform public.review_document('fad00000-0000-4000-8000-0000000000c5', 'verified', v_today + 365, null);
  perform public.review_document('fad00000-0000-4000-8000-0000000000c3', 'verified', v_today, null);
  perform public.review_document('fad00000-0000-4000-8000-0000000000a1', 'verified', v_today + 30, null);
  perform public.review_document('fad00000-0000-4000-8000-0000000000a3', 'verified', v_today + 29, null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fa000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  foreach v_key in array array['j1', 'j2', 'j3', 'j4'] loop
    v_id := public.create_job_post(jsonb_build_object(
      'job_type', 'lesson', 'title', '알림 공고 ' || v_key, 'region', '서울',
      'class_date', v_today + 10, 'headcount', 1, 'description', '알림 설명', 'deadline', v_today + 9));
    perform set_config('p3n.' || v_key, v_id::text, true);
  end loop;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fa000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  perform public.aqua_save_push_subscription(
    'https://fcm.googleapis.com/fcm/send/p3n-i1-device', repeat('A', 87), repeat('B', 22));
  reset role;

  perform set_config('p3n.sub_i1',
    (select s.id::text from public.aqua_push_subscriptions s
     where s.endpoint = 'https://fcm.googleapis.com/fcm/send/p3n-i1-device'), true);
end $$;

-- ---------------------------------------------------------------------
-- triggers_fire:
--   지원 → 센터(새 지원자) · 선택 → 강사('알림센터1에서 선택했어요') + 그 강사 기기로 대기열
--   제안 → 강사 · 거절/수락 → 센터 · 직접 마감 → 남은 지원자(마감)·남은 제안(마감)
--   서류 확인 → 주인 · 서류 반려 → 주인(사유 포함, 파일 경로 없음) · 계정 정지 → 당사자(사유 포함)
--   알림 문구에 연락처 없음
-- ---------------------------------------------------------------------
do $$
declare
  c1 constant uuid := 'fa000000-0000-4000-8000-0000000000c1';
  i1 constant uuid := 'fa000000-0000-4000-8000-0000000000a1';
  i2 constant uuid := 'fa000000-0000-4000-8000-0000000000a2';
  v_j1 uuid := current_setting('p3n.j1')::uuid;
  v_j3 uuid := current_setting('p3n.j3')::uuid;
  v_j4 uuid := current_setting('p3n.j4')::uuid;
  v_app uuid;
  v_offer uuid;
  v_offer4 uuid;
  n int;
  v_body text;
begin
  -- 서류 확인(준비 단계) → C1
  select count(*) into n from public.aqua_notifications
    where user_id = c1 and kind = 'doc_verified' and body = '사업자등록증' and link = '/?tab=documents';
  if n <> 1 then raise exception 'triggers_fire 실패 (서류 확인 알림 %건)', n; end if;

  -- 지원 → 센터
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(v_j1, '지원합니다');
  reset role;
  select count(*) into n from public.aqua_notifications
    where user_id = c1 and kind = 'application_new' and title = '새 지원자가 있어요'
      and body = '알림 공고 j1' and link = '/?tab=applicants&job=' || v_j1 and read_at is null;
  if n <> 1 then raise exception 'triggers_fire 실패 (새 지원자 알림 %건)', n; end if;

  -- 선택 → 강사 + 기기 대기열
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform public.select_applicant(v_app);
  reset role;
  select count(*) into n from public.aqua_notifications
    where user_id = i1 and kind = 'application_selected' and title = '알림센터1에서 선택했어요'
      and link = '/?tab=applications&job=' || v_j1;
  if n <> 1 then raise exception 'triggers_fire 실패 (선택 알림 %건)', n; end if;
  select count(*) into n from public.aqua_push_outbox o
    where o.subscription_id = current_setting('p3n.sub_i1')::uuid
      and o.title = '알림센터1에서 선택했어요' and o.link = '/?tab=applications&job=' || v_j1 and o.sent_at is null;
  if n <> 1 then raise exception 'triggers_fire 실패 (선택 푸시 대기열 %건)', n; end if;
  -- 대기열은 받는 사람 기기로만
  select count(*) into n from public.aqua_push_outbox o
    join public.aqua_notifications a on a.id = o.notification_id
    join public.aqua_push_subscriptions s on s.id = o.subscription_id
    where a.user_id in (c1, i1, i2) and s.user_id <> a.user_id;
  if n <> 0 then raise exception 'triggers_fire 실패 (다른 사람 기기로 대기열 %건)', n; end if;

  -- 제안 → 강사, 거절 → 센터
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_offer := public.send_offer(current_setting('p3n.j2')::uuid, i2, '함께해요');
  reset role;
  select count(*) into n from public.aqua_notifications
    where user_id = i2 and kind = 'offer_new' and title = '알림센터1에서 제안이 왔어요'
      and link = '/?tab=offers&offer=' || v_offer;
  if n <> 1 then raise exception 'triggers_fire 실패 (제안 도착 알림 %건)', n; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i2, 'role', 'authenticated')::text, true);
  perform public.respond_offer(v_offer, false);
  reset role;
  select count(*) into n from public.aqua_notifications
    where user_id = c1 and kind = 'offer_declined' and body = '알림 공고 j2';
  if n <> 1 then raise exception 'triggers_fire 실패 (제안 거절 알림 %건)', n; end if;

  -- 제안 → 수락 → 센터
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_offer := public.send_offer(v_j3, i2, null);
  perform set_config('request.jwt.claims', json_build_object('sub', i2, 'role', 'authenticated')::text, true);
  perform public.respond_offer(v_offer, true);
  reset role;
  select count(*) into n from public.aqua_notifications
    where user_id = c1 and kind = 'offer_accepted' and link = '/?tab=applicants&job=' || v_j3;
  if n <> 1 then raise exception 'triggers_fire 실패 (제안 수락 알림 %건)', n; end if;

  -- 직접 마감 → 남은 지원자(I2) 마감, 남은 제안(I1) 마감
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i2, 'role', 'authenticated')::text, true);
  perform public.apply_to_job(v_j4, null);
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_offer4 := public.send_offer(v_j4, i1, null);
  perform public.close_job_post(v_j4);
  reset role;
  select count(*) into n from public.aqua_notifications
    where user_id = i2 and kind = 'application_closed' and title = '지원한 공고가 마감됐어요' and body = '알림 공고 j4';
  if n <> 1 then raise exception 'triggers_fire 실패 (마감 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i1 and kind = 'offer_expired' and link = '/?tab=offers&offer=' || v_offer4;
  if n <> 1 then raise exception 'triggers_fire 실패 (제안 마감 알림 %건)', n; end if;

  -- 서류 반려 → 주인 (사유 포함, 파일 경로·메타 없음)
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fa000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('fad00000-0000-4000-8000-0000000000a2', 'rejected', null, '사진 흐림');
  reset role;
  select a.body into v_body from public.aqua_notifications a where a.user_id = i2 and a.kind = 'doc_rejected';
  if v_body is distinct from '강사 자격증 · 사유: 사진 흐림' then
    raise exception 'triggers_fire 실패 (서류 반려 본문 %)', v_body;
  end if;

  -- 계정 정지 → 당사자 (관리자 조치 사유)
  perform set_config('aqua.action_reason', '허위 공고', true);
  update public.profiles set account_status = 'suspended' where id = i2;
  perform set_config('aqua.action_reason', '', true);
  update public.profiles set account_status = 'active' where id = i2;
  select count(*) into n from public.aqua_notifications
    where user_id = i2 and kind = 'account_suspended' and body = '사유: 허위 공고' and link = '/';
  if n <> 1 then raise exception 'triggers_fire 실패 (계정 정지 알림 %건)', n; end if;

  -- 알림 문구에 연락처·서류 파일 경로 없음, 링크는 전부 앱 안 주소
  select count(*) into n from public.aqua_notifications
    where user_id in (c1, i1, i2)
      and (title || ' ' || body) ~ '(010-|@aquajob|\.jpg|cert-secret)';
  if n <> 0 then raise exception 'triggers_fire 실패 (연락처·파일 경로 포함 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id in (c1, i1, i2) and (link is null or left(link, 1) <> '/' or left(link, 2) = '//');
  if n <> 0 then raise exception 'triggers_fire 실패 (앱 밖 링크 %건)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- notifications_own_only:
--   I1은 자기 알림만 본다(C1 알림 0, 관리자도 남의 알림 0). 비로그인은 표 권한 없음.
--   직접 insert/update/delete 불가. 읽음 RPC는 내 것만 바꾼다. aqua_notify는 회원이 못 부른다.
-- ---------------------------------------------------------------------
do $$
declare
  c1 constant uuid := 'fa000000-0000-4000-8000-0000000000c1';
  i1 constant uuid := 'fa000000-0000-4000-8000-0000000000a1';
  v_c1_notif uuid;
  v_i1_total int;
  n int;
  v_blocked boolean;
begin
  select a.id into v_c1_notif from public.aqua_notifications a where a.user_id = c1 limit 1;
  select count(*) into v_i1_total from public.aqua_notifications a where a.user_id = i1;
  if v_c1_notif is null or v_i1_total = 0 then
    raise exception 'notifications_own_only 실패 (준비 알림 없음)';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.aqua_notifications where user_id = c1;
  if n <> 0 then raise exception 'notifications_own_only 실패 (I1이 C1 알림 %건 봄)', n; end if;
  select count(*) into n from public.aqua_notifications where user_id <> i1;
  if n <> 0 then raise exception 'notifications_own_only 실패 (I1이 남의 알림 %건 봄)', n; end if;
  select count(*) into n from public.aqua_notifications;
  if n <> v_i1_total then raise exception 'notifications_own_only 실패 (I1 자기 알림 %/%)', n, v_i1_total; end if;
  if public.aqua_unread_count() <> v_i1_total then
    raise exception 'notifications_own_only 실패 (안 읽은 개수 %)', public.aqua_unread_count();
  end if;

  -- 직접 쓰기 불가
  v_blocked := false;
  begin
    insert into public.aqua_notifications (user_id, kind, title) values (i1, 'offer_new', '가짜');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'notifications_own_only 실패 (직접 insert 본인)'; end if;
  v_blocked := false;
  begin
    insert into public.aqua_notifications (user_id, kind, title) values (c1, 'offer_new', '가짜');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'notifications_own_only 실패 (직접 insert 남)'; end if;
  v_blocked := false;
  begin
    update public.aqua_notifications set read_at = now() where id = v_c1_notif;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'notifications_own_only 실패 (직접 update)'; end if;
  v_blocked := false;
  begin
    delete from public.aqua_notifications where user_id = i1;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'notifications_own_only 실패 (직접 delete)'; end if;
  v_blocked := false;
  begin
    perform public.aqua_notify(c1, 'offer_new', '가짜', '가짜', '/');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'notifications_own_only 실패 (회원이 aqua_notify 실행)'; end if;

  -- 읽음 RPC: 남의 id는 0건, 모두 읽음도 내 것만
  if public.aqua_mark_read(array[v_c1_notif]) <> 0 then
    raise exception 'notifications_own_only 실패 (남의 알림 읽음 표시)';
  end if;
  if public.aqua_mark_all_read() <> v_i1_total then
    raise exception 'notifications_own_only 실패 (모두 읽음 개수)';
  end if;
  if public.aqua_unread_count() <> 0 then
    raise exception 'notifications_own_only 실패 (모두 읽음 뒤 안 읽은 개수)';
  end if;

  -- 관리자도 남의 알림은 못 본다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fa000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.aqua_notifications where user_id in (c1, i1);
  if n <> 0 then raise exception 'notifications_own_only 실패 (관리자가 남의 알림 %건 봄)', n; end if;
  reset role;

  select count(*) into n from public.aqua_notifications where user_id = c1 and read_at is not null;
  if n <> 0 then raise exception 'notifications_own_only 실패 (C1 알림이 읽음으로 바뀜 %건)', n; end if;

  -- 비로그인: 표·RPC 권한 없음
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_blocked := false;
  begin
    select count(*) into n from public.aqua_notifications;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked and n <> 0 then raise exception 'notifications_own_only 실패 (비로그인 %건)', n; end if;
  v_blocked := false;
  begin
    perform public.aqua_unread_count();
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'notifications_own_only 실패 (비로그인 안 읽은 개수)'; end if;
  v_blocked := false;
  begin
    perform public.aqua_mark_all_read();
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'notifications_own_only 실패 (비로그인 모두 읽음)'; end if;
  reset role;

  -- 실행 권한 표: aqua_notify는 소유자만
  if has_function_privilege('authenticated', 'public.aqua_notify(uuid, text, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.aqua_notify(uuid, text, text, text, text)', 'execute')
     or has_function_privilege('service_role', 'public.aqua_notify(uuid, text, text, text, text)', 'execute') then
    raise exception 'notifications_own_only 실패 (aqua_notify 실행 권한이 열려 있음)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- link_must_be_internal: 다른 사이트 주소·스킴·'//'·'/\'·공백은 표 제약이 거부, 앱 안 주소는 통과
-- ---------------------------------------------------------------------
do $$
declare
  v_link text;
  v_blocked boolean;
begin
  foreach v_link in array array[
    'https://evil.example/x', '//evil.example/x', '/\evil.example', 'javascript:alert(1)',
    'evil.example', '/jobs/1 2', '/a' || chr(10) || 'b', ''
  ] loop
    v_blocked := false;
    begin
      insert into public.aqua_notifications (user_id, kind, title, link)
      values ('fa000000-0000-4000-8000-0000000000a1', 'offer_new', '링크 검사', v_link);
    exception when check_violation then v_blocked := true;
    end;
    if not v_blocked then raise exception 'link_must_be_internal 실패 (%)', v_link; end if;
  end loop;

  insert into public.aqua_notifications (user_id, kind, title, link) values
    ('fa000000-0000-4000-8000-0000000000a1', 'offer_new', '링크 검사', '/'),
    ('fa000000-0000-4000-8000-0000000000a1', 'offer_new', '링크 검사', '/?tab=offers&offer=x'),
    ('fa000000-0000-4000-8000-0000000000a1', 'offer_new', '링크 검사', null);
  delete from public.aqua_notifications where title = '링크 검사';

  -- 종류 목록 밖은 거부
  v_blocked := false;
  begin
    insert into public.aqua_notifications (user_id, kind, title)
    values ('fa000000-0000-4000-8000-0000000000a1', 'marketing', '종류 검사');
  exception when check_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'link_must_be_internal 실패 (알 수 없는 종류)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- push_subscription_own_only:
--   알려진 푸시 서비스 https 주소만 저장(http·다른 호스트·호스트 뒤에 덧붙인 주소·잘못된 키 거부).
--   남의 구독은 못 보고 못 지운다. 직접 insert/update 불가. 비로그인·정지 계정은 저장 불가.
--   한 사람 최대 10대.
-- ---------------------------------------------------------------------
do $$
declare
  c1 constant uuid := 'fa000000-0000-4000-8000-0000000000c1';
  c2 constant uuid := 'fa000000-0000-4000-8000-0000000000c2';
  i1 constant uuid := 'fa000000-0000-4000-8000-0000000000a1';
  i2 constant uuid := 'fa000000-0000-4000-8000-0000000000a2';
  v_ep text;
  v_blocked boolean;
  n int;
  k int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);

  -- 거부되는 주소
  foreach v_ep in array array[
    'http://fcm.googleapis.com/fcm/send/x',
    'https://evil.example/fcm/send/x',
    'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com@evil.example/x',
    'https://fcm.googleapis.com:8443/x',
    'https://localhost/x',
    'https://169.254.169.254/latest',
    'https://fcm.googleapis.com/' || repeat('x', 1000)
  ] loop
    v_blocked := false;
    begin
      perform public.aqua_save_push_subscription(v_ep, repeat('A', 87), repeat('B', 22));
    exception when invalid_parameter_value then v_blocked := true;
    end;
    if not v_blocked then raise exception 'push_subscription_own_only 실패 (주소 %)', left(v_ep, 60); end if;
  end loop;

  -- 잘못된 키
  v_blocked := false;
  begin
    perform public.aqua_save_push_subscription('https://fcm.googleapis.com/fcm/send/p3n-c1', 'bad key!', repeat('B', 22));
  exception when invalid_parameter_value then v_blocked := true;
  end;
  if not v_blocked then raise exception 'push_subscription_own_only 실패 (잘못된 키)'; end if;

  -- 허용되는 주소(애플·모질라·윈도우·FCM)
  perform public.aqua_save_push_subscription('https://web.push.apple.com/p3n-c1', repeat('A', 87), repeat('B', 22));
  perform public.aqua_save_push_subscription('https://updates.push.services.mozilla.com/wpush/v2/p3n-c1', repeat('A', 87), repeat('B', 22));
  perform public.aqua_save_push_subscription('https://wns2-par02p.notify.windows.com/w/?token=p3n-c1', repeat('A', 87), repeat('B', 22));
  select count(*) into n from public.aqua_push_subscriptions;
  if n <> 3 then raise exception 'push_subscription_own_only 실패 (C1 자기 구독 %건)', n; end if;

  -- 남의 구독(I1)은 안 보이고 안 지워진다
  select count(*) into n from public.aqua_push_subscriptions where user_id = i1;
  if n <> 0 then raise exception 'push_subscription_own_only 실패 (남의 구독 %건 봄)', n; end if;
  delete from public.aqua_push_subscriptions where user_id = i1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'push_subscription_own_only 실패 (남의 구독 %건 지움)', n; end if;

  -- 직접 insert/update 불가
  v_blocked := false;
  begin
    insert into public.aqua_push_subscriptions (user_id, endpoint, p256dh, auth)
    values (c1, 'https://evil.example/direct', 'a', 'b');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'push_subscription_own_only 실패 (직접 insert)'; end if;
  v_blocked := false;
  begin
    update public.aqua_push_subscriptions set endpoint = 'https://evil.example/x' where user_id = c1;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'push_subscription_own_only 실패 (직접 update)'; end if;

  -- 내 구독은 지울 수 있다
  delete from public.aqua_push_subscriptions where endpoint = 'https://web.push.apple.com/p3n-c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'push_subscription_own_only 실패 (내 구독 지우기 %건)', n; end if;

  -- 한 사람 최대 10대 (C2가 12대 등록 → 10대만 남음)
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  for k in 1..12 loop
    perform public.aqua_save_push_subscription(
      'https://fcm.googleapis.com/fcm/send/p3n-c2-' || k, repeat('A', 87), repeat('B', 22));
  end loop;
  select count(*) into n from public.aqua_push_subscriptions;
  if n <> 10 then raise exception 'push_subscription_own_only 실패 (기기 10대 제한 %건)', n; end if;
  reset role;

  select count(*) into n from public.aqua_push_subscriptions where user_id = i1;
  if n <> 1 then raise exception 'push_subscription_own_only 실패 (I1 구독이 바뀜 %건)', n; end if;

  -- 비로그인 저장 불가
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_blocked := false;
  begin
    perform public.aqua_save_push_subscription('https://fcm.googleapis.com/fcm/send/p3n-anon', repeat('A', 87), repeat('B', 22));
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'push_subscription_own_only 실패 (비로그인 저장)'; end if;
  v_blocked := false;
  begin
    select count(*) into n from public.aqua_push_subscriptions;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked and n <> 0 then raise exception 'push_subscription_own_only 실패 (비로그인 구독 %건 봄)', n; end if;
  reset role;

  -- 정지 계정 저장 불가
  update public.profiles set account_status = 'suspended' where id = i2;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i2, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.aqua_save_push_subscription('https://fcm.googleapis.com/fcm/send/p3n-i2', repeat('A', 87), repeat('B', 22));
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  update public.profiles set account_status = 'active' where id = i2;
  if not v_blocked then raise exception 'push_subscription_own_only 실패 (정지 계정 저장)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- outbox_not_readable_by_users:
--   대기열·설정표·만료 기록은 회원 권한 없음. 대기열 가져가기 RPC는 service role만.
--   설정표(발송 비밀값)는 service role도 못 읽는다.
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fa000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    select count(*) into n from public.aqua_push_outbox;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'outbox_not_readable_by_users 실패 (대기열 조회)'; end if;
  v_blocked := false;
  begin
    perform * from public.aqua_claim_push_outbox(10);
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'outbox_not_readable_by_users 실패 (대기열 가져가기)'; end if;
  v_blocked := false;
  begin
    select count(*) into n from public.aqua_push_config;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'outbox_not_readable_by_users 실패 (설정표 조회)'; end if;
  v_blocked := false;
  begin
    select count(*) into n from public.aqua_doc_expiry_notices;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'outbox_not_readable_by_users 실패 (만료 기록 조회)'; end if;
  v_blocked := false;
  begin
    perform public.aqua_notify_expiring_docs();
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'outbox_not_readable_by_users 실패 (만료 알림 직접 실행)'; end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_blocked := false;
  begin
    select count(*) into n from public.aqua_push_outbox;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'outbox_not_readable_by_users 실패 (비로그인 대기열 조회)'; end if;
  reset role;

  if not has_function_privilege('service_role', 'public.aqua_claim_push_outbox(integer)', 'execute') then
    raise exception 'outbox_not_readable_by_users 실패 (service role이 대기열을 못 가져감)';
  end if;
  if has_table_privilege('service_role', 'public.aqua_push_config', 'select') then
    raise exception 'outbox_not_readable_by_users 실패 (service role이 설정표를 읽음)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- expiring_docs_idempotent:
--   유효기간 +30일(I1 강사 자격증) · 오늘(C2 대표강사 자격증)은 한 번씩만, 두 번 돌려도 그대로.
--   +29일(I1 배상책임보험)과 새것에 밀린 옛 서류(C1 대표강사 자격증 +30일)는 알리지 않는다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_second int;
begin
  perform public.aqua_notify_expiring_docs();
  v_second := public.aqua_notify_expiring_docs();
  if v_second <> 0 then raise exception 'expiring_docs_idempotent 실패 (두 번째 실행 %건)', v_second; end if;

  select count(*) into n from public.aqua_notifications
    where user_id = 'fa000000-0000-4000-8000-0000000000a1' and kind = 'doc_expiring';
  if n <> 1 then raise exception 'expiring_docs_idempotent 실패 (I1 만료 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = 'fa000000-0000-4000-8000-0000000000a1' and kind = 'doc_expiring'
      and title = '강사 자격증 유효기간이 30일 남았어요' and link = '/?tab=documents';
  if n <> 1 then raise exception 'expiring_docs_idempotent 실패 (I1 30일 문구)'; end if;

  select count(*) into n from public.aqua_notifications
    where user_id = 'fa000000-0000-4000-8000-0000000000c2' and kind = 'doc_expiring'
      and title = '대표강사 자격증 유효기간이 오늘까지예요';
  if n <> 1 then raise exception 'expiring_docs_idempotent 실패 (C2 오늘 만료 %건)', n; end if;

  select count(*) into n from public.aqua_notifications
    where user_id = 'fa000000-0000-4000-8000-0000000000c1' and kind = 'doc_expiring';
  if n <> 0 then raise exception 'expiring_docs_idempotent 실패 (밀려난 옛 서류 알림 %건)', n; end if;

  select count(*) into n from public.aqua_doc_expiry_notices
    where doc_id in ('fad00000-0000-4000-8000-0000000000a1', 'fad00000-0000-4000-8000-0000000000c3');
  if n <> 2 then raise exception 'expiring_docs_idempotent 실패 (만료 기록 %건)', n; end if;
end $$;

select 'notify ok' as result;

rollback;
