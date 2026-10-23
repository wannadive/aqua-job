-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)의 SQL Editor에서 실행 — 워너다이브 프로젝트에서 실행하지 말 것
-- =====================================================================
-- 아쿠아잡 011 신고·관리자 조치 검사 (개발/테스트 전용) — 011 적용 후 실행
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다(알림·발송 대기열도 함께 되돌아간다).
-- 성공하면 마지막에 'moderation ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
--
-- 검사 사이에 만든 공고·제안·신고 id는 트랜잭션 설정값(p3m.*)에 담아 넘긴다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자. auth.users에 넣으면 가입 트리거가 돈다(→ 센터는 centers 행, 연락처 행도 생긴다).
--   C1 = fb000000-0000-4000-8000-0000000000c1 (센터 '신고센터1', 사업자등록증 확인 — 공고 m1 m2 m5 m6)
--   C2 = fb000000-0000-4000-8000-0000000000c2 (센터 '신고센터2', 사업자등록증 확인 — 공고 m3 m4, 퇴출 검사)
--   I1 = fb000000-0000-4000-8000-0000000000a1 (강사, 공개 이력서 — 신고하는 사람·지원자, 정지 검사)
--   I2 = fb000000-0000-4000-8000-0000000000a2 (강사, 공개 이력서 — 퇴출 검사)
--   I3 = fb000000-0000-4000-8000-0000000000a3 (강사, 비공개 이력서)
--   I4 = fb000000-0000-4000-8000-0000000000a4 (강사, 공개 이력서 — 제안 받는 사람)
--   D1 = fb000000-0000-4000-8000-0000000000d1 (관리자 + 강사)
--   D2 = fb000000-0000-4000-8000-0000000000d2 (다른 관리자 + 강사)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'p3m-c1@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"신고센터1","phone":"010-9200-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000c2',
   'authenticated', 'authenticated', 'p3m-c2@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"신고센터2","phone":"010-9200-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'p3m-i1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"신고강사1","phone":"010-9200-0011"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'p3m-i2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"신고강사2","phone":"010-9200-0012"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000a3',
   'authenticated', 'authenticated', 'p3m-i3@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"신고강사3","phone":"010-9200-0013"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000a4',
   'authenticated', 'authenticated', 'p3m-i4@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"신고강사4","phone":"010-9200-0014"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'p3m-d1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"신고관리자1"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000d2',
   'authenticated', 'authenticated', 'p3m-d2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"신고관리자2"}', now(), now());

update public.profiles set roles = array['admin', 'instructor'], role = 'admin'
  where id in ('fb000000-0000-4000-8000-0000000000d1', 'fb000000-0000-4000-8000-0000000000d2');

-- 무료 기간에서 시작한다(운영 값이 무엇이든 이 트랜잭션 안에서만)
update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

insert into public.talent_profiles (user_id, is_public, onboarding_done, regions, scopes, available_days, intro)
values
  ('fb000000-0000-4000-8000-0000000000a1', true, true, array['서울'], array['pool'], array['토'], '신고1'),
  ('fb000000-0000-4000-8000-0000000000a2', true, true, array['서울'], array['pool'], array['토'], '신고2'),
  ('fb000000-0000-4000-8000-0000000000a3', false, true, array['서울'], array['pool'], array['토'], '신고3'),
  ('fb000000-0000-4000-8000-0000000000a4', true, true, array['서울'], array['pool'], array['토'], '신고4');

insert into public.verification_documents (id, owner_id, doc_type, file_path, meta) values
  ('fbd00000-0000-4000-8000-0000000000c1', 'fb000000-0000-4000-8000-0000000000c1',
   'business_registration', 'fb000000-0000-4000-8000-0000000000c1/biz.jpg', '{}'),
  ('fbd00000-0000-4000-8000-0000000000c2', 'fb000000-0000-4000-8000-0000000000c2',
   'business_registration', 'fb000000-0000-4000-8000-0000000000c2/biz.jpg', '{}');

-- 서류 확인 → 공고 준비
--   C1: p3m.m1 인원 2 (숨김 검사) · p3m.m2 인원 1 (신고 대상) · p3m.m5 인원 1 · p3m.m6 인원 1 (기타 사유 숨김)
--   C2: p3m.m3 인원 2 · p3m.m4 인원 1 (퇴출 검사)
--   p3m.c1center · p3m.c2center = centers.id
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_key text;
  v_owner text;
  v_head int;
  v_id uuid;
begin
  perform set_config('p3m.c1center',
    (select c.id::text from public.centers c where c.owner_user_id = 'fb000000-0000-4000-8000-0000000000c1'), true);
  perform set_config('p3m.c2center',
    (select c.id::text from public.centers c where c.owner_user_id = 'fb000000-0000-4000-8000-0000000000c2'), true);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fb000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('fbd00000-0000-4000-8000-0000000000c1', 'verified', null, null);
  perform public.review_document('fbd00000-0000-4000-8000-0000000000c2', 'verified', null, null);

  for v_key, v_owner, v_head in
    select * from (values
      ('m1', 'fb000000-0000-4000-8000-0000000000c1', 2), ('m2', 'fb000000-0000-4000-8000-0000000000c1', 1),
      ('m5', 'fb000000-0000-4000-8000-0000000000c1', 1), ('m6', 'fb000000-0000-4000-8000-0000000000c1', 1),
      ('m3', 'fb000000-0000-4000-8000-0000000000c2', 2), ('m4', 'fb000000-0000-4000-8000-0000000000c2', 1)
    ) v(k, o, h)
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    v_id := public.create_job_post(jsonb_build_object(
      'job_type', 'lesson', 'title', '신고 공고 ' || v_key, 'region', '서울',
      'class_date', v_today + 10, 'headcount', v_head, 'description', '신고 설명', 'deadline', v_today + 9));
    perform set_config('p3m.' || v_key, v_id::text, true);
  end loop;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- report_rate_limit:
--   I1이 m2를 신고 → 같은 대상 다시 '이미 신고했어요'(22023). 다른 대상(센터 C1)은 된다.
--   기타 설명 없음 · 설명 501자 · 목록 밖 사유 · 대상 종류 오류는 22023.
--   24시간 20건 한도: 직접 18건을 채워 20건 → 21번째 거부. 24시간이 지나면(시각을 당겨서) 같은 대상도 다시 된다.
-- ---------------------------------------------------------------------
do $$
declare
  i1 uuid := 'fb000000-0000-4000-8000-0000000000a1';
  v_m2 uuid := current_setting('p3m.m2')::uuid;
  v_msg text;
  v_blocked boolean;
  v_case text;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  perform public.submit_report('job', v_m2, 'false_posting', '내용이 실제와 달라요');

  v_msg := null;
  begin
    perform public.submit_report('job', v_m2, 'illegal', null);
  exception when invalid_parameter_value then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from '이미 신고했어요' then
    reset role;
    raise exception 'report_rate_limit 실패 (같은 대상 두 번: %)', coalesce(v_msg, '통과');
  end if;

  -- 다른 대상은 된다(기타 + 설명)
  perform public.submit_report('center', current_setting('p3m.c1center')::uuid, 'other', '사진 도용 의심');

  -- 입력 검사
  foreach v_case in array array['other_no_note', 'note_501', 'bad_reason', 'bad_type'] loop
    v_blocked := false;
    begin
      if v_case = 'other_no_note' then
        perform public.submit_report('job', current_setting('p3m.m5')::uuid, 'other', '   ');
      elsif v_case = 'note_501' then
        perform public.submit_report('job', current_setting('p3m.m5')::uuid, 'illegal', repeat('가', 501));
      elsif v_case = 'bad_reason' then
        perform public.submit_report('job', current_setting('p3m.m5')::uuid, 'rude', null);
      else
        perform public.submit_report('applicant', current_setting('p3m.m5')::uuid, 'illegal', null);
      end if;
    exception when invalid_parameter_value then
      v_blocked := true;
    end;
    if not v_blocked then reset role; raise exception 'report_rate_limit 실패 (입력 %)', v_case; end if;
  end loop;
  reset role;

  -- 20건까지 채운다(준비용 직접 insert — postgres 세션)
  insert into public.job_reports (reporter_id, target_type, target_id, reason)
  select i1, 'job', gen_random_uuid(), 'illegal' from generate_series(1, 18);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  v_msg := null;
  begin
    perform public.submit_report('center', current_setting('p3m.c2center')::uuid, 'illegal', null);
  exception when invalid_parameter_value then
    v_msg := sqlerrm;
  end;
  reset role;
  if v_msg is distinct from '신고는 24시간에 20건까지 할 수 있어요' then
    raise exception 'report_rate_limit 실패 (24시간 21번째: %)', coalesce(v_msg, '통과');
  end if;

  -- 24시간이 지나면 같은 대상도 다시
  update public.job_reports set created_at = created_at - interval '25 hours' where reporter_id = i1;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  perform public.submit_report('job', v_m2, 'false_posting', null);
  reset role;
  select count(*) into n from public.job_reports where reporter_id = i1 and target_id = v_m2 and status = 'open';
  if n <> 2 then raise exception 'report_rate_limit 실패 (24시간 뒤 다시 신고 %건)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- cannot_report_self_or_invisible:
--   C1은 내 공고·내 센터·내 계정을 신고할 수 없다(22023).
--   볼 수 없는 대상은 P0002: 강사 I1 → 다른 강사 I2, 센터 C1 → 비공개 강사 I3, 없는 공고,
--   정지된 센터 C2의 공고·센터. 센터 C1 → 공개 강사 I2는 된다.
--   정지된 I4 · 비로그인은 신고할 수 없다(42501).
-- ---------------------------------------------------------------------
do $$
declare
  c1 uuid := 'fb000000-0000-4000-8000-0000000000c1';
  i1 uuid := 'fb000000-0000-4000-8000-0000000000a1';
  i4 uuid := 'fb000000-0000-4000-8000-0000000000a4';
  v_blocked boolean;
  v_case text;
  v_type text;
  v_target uuid;
begin
  -- 나 자신
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  foreach v_case in array array['job', 'center', 'profile'] loop
    v_target := case v_case
      when 'job' then current_setting('p3m.m1')::uuid
      when 'center' then current_setting('p3m.c1center')::uuid
      else c1
    end;
    v_blocked := false;
    begin
      perform public.submit_report(v_case, v_target, 'illegal', null);
    exception when invalid_parameter_value then
      v_blocked := true;
    end;
    if not v_blocked then reset role; raise exception 'cannot_report_self_or_invisible 실패 (내 %)', v_case; end if;
  end loop;

  -- 비공개 강사(센터가 볼 수 없음) → P0002, 공개 강사 → 된다
  v_blocked := false;
  begin
    perform public.submit_report('profile', 'fb000000-0000-4000-8000-0000000000a3', 'fake_document', null);
  exception when no_data_found then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'cannot_report_self_or_invisible 실패 (비공개 강사)'; end if;
  perform set_config('p3m.r_c1_i2',
    public.submit_report('profile', 'fb000000-0000-4000-8000-0000000000a2', 'fake_document', '자격증 사진이 다른 사람')::text,
    true);

  -- 강사는 다른 강사를 볼 수 없다 · 없는 공고
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  foreach v_case in array array['other_instructor', 'missing_job'] loop
    v_blocked := false;
    begin
      if v_case = 'other_instructor' then
        perform public.submit_report('profile', 'fb000000-0000-4000-8000-0000000000a2', 'illegal', null);
      else
        perform public.submit_report('job', gen_random_uuid(), 'illegal', null);
      end if;
    exception when no_data_found then
      v_blocked := true;
    end;
    if not v_blocked then reset role; raise exception 'cannot_report_self_or_invisible 실패 (%)', v_case; end if;
  end loop;
  reset role;

  -- 정지된 센터의 공고·센터는 보이지 않는다
  update public.profiles set account_status = 'suspended' where id = 'fb000000-0000-4000-8000-0000000000c2';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  foreach v_type in array array['job', 'center'] loop
    v_blocked := false;
    begin
      perform public.submit_report(v_type,
        case when v_type = 'job' then current_setting('p3m.m3')::uuid else current_setting('p3m.c2center')::uuid end,
        'illegal', null);
    exception when no_data_found then
      v_blocked := true;
    end;
    if not v_blocked then reset role; raise exception 'cannot_report_self_or_invisible 실패 (정지 센터 %)', v_type; end if;
  end loop;
  reset role;
  update public.profiles set account_status = 'active' where id = 'fb000000-0000-4000-8000-0000000000c2';

  -- 정지된 신고자
  update public.profiles set account_status = 'suspended' where id = i4;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i4, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.submit_report('job', current_setting('p3m.m2')::uuid, 'illegal', null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  update public.profiles set account_status = 'active' where id = i4;
  if not v_blocked then raise exception 'cannot_report_self_or_invisible 실패 (정지된 신고자)'; end if;

  -- 비로그인(실행 권한 없음)
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_blocked := false;
  begin
    perform public.submit_report('job', current_setting('p3m.m2')::uuid, 'illegal', null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'cannot_report_self_or_invisible 실패 (비로그인)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- reports_own_only:
--   I1은 자기 신고만 본다(남의 신고 0행). C2는 I1의 신고를 못 본다. 처리 메모(resolution)·처리한 관리자 칸은
--   직접 조회 권한이 없다. 직접 insert·update·delete 거부. 비로그인은 0행(권한 없음). 관리자는 본다.
-- ---------------------------------------------------------------------
do $$
declare
  i1 uuid := 'fb000000-0000-4000-8000-0000000000a1';
  n int;
  v_blocked boolean;
  v_text text;
  v_case text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_reports r where r.reporter_id <> i1;
  if n <> 0 then reset role; raise exception 'reports_own_only 실패 (I1이 본 남의 신고 %행)', n; end if;
  select count(*) into n from public.job_reports r where r.reporter_id = i1;
  if n < 3 then reset role; raise exception 'reports_own_only 실패 (I1 자기 신고 %행)', n; end if;

  foreach v_case in array array['resolution', 'resolved_by', 'insert', 'update', 'delete'] loop
    v_blocked := false;
    begin
      if v_case = 'resolution' then
        select r.resolution into v_text from public.job_reports r limit 1;
      elsif v_case = 'resolved_by' then
        select r.resolved_by::text into v_text from public.job_reports r limit 1;
      elsif v_case = 'insert' then
        insert into public.job_reports (reporter_id, target_type, target_id, reason)
        values (i1, 'job', current_setting('p3m.m5')::uuid, 'illegal');
      elsif v_case = 'update' then
        update public.job_reports set status = 'dismissed' where reporter_id = i1;
      else
        delete from public.job_reports where reporter_id = i1;
      end if;
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    if not v_blocked then reset role; raise exception 'reports_own_only 실패 (신고자 %)', v_case; end if;
  end loop;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fb000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_reports;
  if n <> 0 then reset role; raise exception 'reports_own_only 실패 (C2가 본 신고 %행)', n; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'fb000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_reports r where r.reporter_id = i1;
  if n < 3 then reset role; raise exception 'reports_own_only 실패 (관리자가 본 I1 신고 %행)', n; end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    select count(*) into n from public.job_reports;
  exception when insufficient_privilege then
    n := 0;
  end;
  reset role;
  if n <> 0 then raise exception 'reports_own_only 실패 (비로그인 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- admin_actions_admin_only:
--   센터 C1 · 강사 I1 · 정지된 관리자 D2 · 비로그인은 관리자 RPC 4개 모두 42501.
--   admin_actions 직접 insert 거부. 거부 뒤 공고·계정·신고 상태는 그대로.
-- ---------------------------------------------------------------------
do $$
declare
  v_report uuid := current_setting('p3m.r_c1_i2')::uuid;
  v_user uuid;
  v_rpc text;
  v_blocked boolean;
  n int;
begin
  update public.profiles set account_status = 'suspended' where id = 'fb000000-0000-4000-8000-0000000000d2';

  foreach v_user in array array['fb000000-0000-4000-8000-0000000000c1', 'fb000000-0000-4000-8000-0000000000a1',
                                'fb000000-0000-4000-8000-0000000000d2']::uuid[] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    foreach v_rpc in array array['hide', 'status', 'resolve', 'list', 'direct'] loop
      v_blocked := false;
      begin
        if v_rpc = 'hide' then
          perform public.admin_hide_job(current_setting('p3m.m2')::uuid, 'illegal', null);
        elsif v_rpc = 'status' then
          perform public.admin_set_account_status('fb000000-0000-4000-8000-0000000000a4', 'banned', 'illegal', null);
        elsif v_rpc = 'resolve' then
          perform public.admin_resolve_report(v_report, 'dismissed', null);
        elsif v_rpc = 'list' then
          perform * from public.admin_list_reports(null);
        else
          insert into public.admin_actions (admin_id, target_user_id, action, reason)
          values (v_user, 'fb000000-0000-4000-8000-0000000000a4', 'account_banned', 'illegal');
        end if;
      exception when insufficient_privilege then
        v_blocked := true;
      end;
      if not v_blocked then
        reset role;
        raise exception 'admin_actions_admin_only 실패 (% → %)', v_user, v_rpc;
      end if;
    end loop;
    reset role;
  end loop;

  update public.profiles set account_status = 'active' where id = 'fb000000-0000-4000-8000-0000000000d2';

  -- 비로그인(실행 권한 없음)
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  foreach v_rpc in array array['hide', 'status', 'resolve', 'list'] loop
    v_blocked := false;
    begin
      if v_rpc = 'hide' then
        perform public.admin_hide_job(current_setting('p3m.m2')::uuid, 'illegal', null);
      elsif v_rpc = 'status' then
        perform public.admin_set_account_status('fb000000-0000-4000-8000-0000000000a4', 'banned', 'illegal', null);
      elsif v_rpc = 'resolve' then
        perform public.admin_resolve_report(v_report, 'dismissed', null);
      else
        perform * from public.admin_list_reports(null);
      end if;
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    if not v_blocked then reset role; raise exception 'admin_actions_admin_only 실패 (비로그인 %)', v_rpc; end if;
  end loop;
  reset role;

  -- 아무것도 바뀌지 않았다
  select count(*) into n from public.job_posts where id = current_setting('p3m.m2')::uuid and status = 'open';
  if n <> 1 then raise exception 'admin_actions_admin_only 실패 (공고 상태가 바뀜)'; end if;
  select count(*) into n from public.profiles
    where id = 'fb000000-0000-4000-8000-0000000000a4' and account_status = 'active';
  if n <> 1 then raise exception 'admin_actions_admin_only 실패 (계정 상태가 바뀜)'; end if;
  select count(*) into n from public.job_reports where id = v_report and status = 'open';
  if n <> 1 then raise exception 'admin_actions_admin_only 실패 (신고 상태가 바뀜)'; end if;
  select count(*) into n from public.admin_actions where target_user_id = 'fb000000-0000-4000-8000-0000000000a4';
  if n <> 0 then raise exception 'admin_actions_admin_only 실패 (관리자 기록 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- hide_job_effects:
--   m1(인원 2): I1 지원 · I2에게 제안(보냄) · I4 제안 수락 → 관리자 숨김(허위 공고).
--   → 공고 hidden, I1 지원 미선택(알림 '마감' 한 번), I2 제안 마감(알림), I4 수락은 그대로,
--     C1 알림 '공고가 숨김 처리됐어요' 본문에 '사유: 허위 공고', admin_actions에 사유·설명·공고.
--   숨긴 공고는 공개 요약에 없고 신고도 못 한다(P0002). 다시 숨김·기타 설명 없음·목록 밖 사유는 22023,
--   없는 공고는 P0002. 기타 사유는 설명이 알림에 붙는다. 함수가 끝나면 사유 설정값은 비어 있다.
-- ---------------------------------------------------------------------
do $$
declare
  c1 uuid := 'fb000000-0000-4000-8000-0000000000c1';
  i1 uuid := 'fb000000-0000-4000-8000-0000000000a1';
  i2 uuid := 'fb000000-0000-4000-8000-0000000000a2';
  i4 uuid := 'fb000000-0000-4000-8000-0000000000a4';
  d1 uuid := 'fb000000-0000-4000-8000-0000000000d1';
  v_m1 uuid := current_setting('p3m.m1')::uuid;
  v_m6 uuid := current_setting('p3m.m6')::uuid;
  v_app uuid;
  v_o2 uuid;
  v_o4 uuid;
  v_blocked boolean;
  v_case text;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(v_m1, null);
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_o2 := public.send_offer(v_m1, i2, null);
  v_o4 := public.send_offer(v_m1, i4, null);
  perform set_config('request.jwt.claims', json_build_object('sub', i4, 'role', 'authenticated')::text, true);
  perform public.respond_offer(v_o4, true);

  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  perform public.admin_hide_job(v_m1, 'false_posting', '공고 내용 확인');
  if coalesce(current_setting('aqua.action_reason', true), '') <> '' then
    reset role;
    raise exception 'hide_job_effects 실패 (사유 설정값이 남음)';
  end if;
  reset role;

  select count(*) into n from public.job_posts where id = v_m1 and status = 'hidden';
  if n <> 1 then raise exception 'hide_job_effects 실패 (공고 상태)'; end if;
  select count(*) into n from public.job_applications where id = v_app and status = 'not_selected' and decided_at is not null;
  if n <> 1 then raise exception 'hide_job_effects 실패 (지원 상태)'; end if;
  select count(*) into n from public.job_offers where id = v_o2 and status = 'expired' and responded_at is not null;
  if n <> 1 then raise exception 'hide_job_effects 실패 (보낸 제안 상태)'; end if;
  select count(*) into n from public.job_offers where id = v_o4 and status = 'accepted';
  if n <> 1 then raise exception 'hide_job_effects 실패 (수락한 제안이 바뀜)'; end if;

  select count(*) into n from public.aqua_notifications
    where user_id = c1 and kind = 'job_hidden' and body = '신고 공고 m1 · 사유: 허위 공고'
      and link = '/?tab=jobs&job=' || v_m1;
  if n <> 1 then raise exception 'hide_job_effects 실패 (공고 주인 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i1 and kind = 'application_closed' and link = '/?tab=applications&job=' || v_m1;
  if n <> 1 then raise exception 'hide_job_effects 실패 (지원자 마감 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i2 and kind = 'offer_expired' and link = '/?tab=offers&offer=' || v_o2;
  if n <> 1 then raise exception 'hide_job_effects 실패 (제안 마감 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i4 and kind = 'offer_expired' and link = '/?tab=offers&offer=' || v_o4;
  if n <> 0 then raise exception 'hide_job_effects 실패 (수락한 강사 마감 알림 %건)', n; end if;

  select count(*) into n from public.admin_actions
    where admin_id = d1 and target_user_id = c1 and action = 'job_hidden' and target_job_id = v_m1
      and reason = 'false_posting' and note = '공고 내용 확인';
  if n <> 1 then raise exception 'hide_job_effects 실패 (관리자 기록 %행)', n; end if;

  -- 공개 경로에서 빠지고, 신고도 못 한다
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i4, 'role', 'authenticated')::text, true);
  select count(*) into n from public.get_job_summary(v_m1);
  if n <> 0 then reset role; raise exception 'hide_job_effects 실패 (숨긴 공고 요약 %행)', n; end if;
  v_blocked := false;
  begin
    perform public.submit_report('job', v_m1, 'illegal', null);
  exception when no_data_found then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'hide_job_effects 실패 (숨긴 공고 신고)'; end if;

  -- 입력 검사
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  foreach v_case in array array['again', 'other_no_note', 'bad_reason', 'missing'] loop
    v_blocked := false;
    begin
      if v_case = 'again' then
        perform public.admin_hide_job(v_m1, 'illegal', null);
      elsif v_case = 'other_no_note' then
        perform public.admin_hide_job(v_m6, 'other', null);
      elsif v_case = 'bad_reason' then
        perform public.admin_hide_job(v_m6, 'bad_center', '나쁜 센터');
      else
        perform public.admin_hide_job(gen_random_uuid(), 'illegal', null);
      end if;
    exception
      when invalid_parameter_value then
        v_blocked := v_case <> 'missing';
      when no_data_found then
        v_blocked := v_case = 'missing';
    end;
    if not v_blocked then reset role; raise exception 'hide_job_effects 실패 (입력 %)', v_case; end if;
  end loop;

  -- 기타 사유: 설명이 알림에 붙는다(줄바꿈은 공백으로)
  perform public.admin_hide_job(v_m6, 'other', e'다른 센터 사진\n도용');
  reset role;
  select count(*) into n from public.aqua_notifications
    where user_id = c1 and kind = 'job_hidden' and body = '신고 공고 m6 · 사유: 기타 · 다른 센터 사진 도용';
  if n <> 1 then raise exception 'hide_job_effects 실패 (기타 사유 알림 %건)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- ban_effects:
--   센터 C2 퇴출(연락처 수집 목적): 계정 banned · is_active() 거짓(앱 차단 화면), 모집 중 공고 m3·m4 hidden,
--   m3 지원(I1) 미선택(I1에게 마감 알림) · m3 보낸 제안(I4) 마감(I4에게 알림),
--   C2 알림은 계정 퇴출 하나뿐(사유 포함, 공고 숨김 알림 없음), 공개 목록에서 빠짐, 공고 등록·신고·푸시 등록 거부.
--   강사 I2 퇴출(가짜 서류): m5 지원 → 미선택, 받은 제안(m2) → 마감, I2에게는 계정 알림만,
--   지원 거부 · 둘러보기에서 빠짐. 함수가 끝나면 조용히 설정값은 비어 있다.
-- ---------------------------------------------------------------------
do $$
declare
  c1 uuid := 'fb000000-0000-4000-8000-0000000000c1';
  c2 uuid := 'fb000000-0000-4000-8000-0000000000c2';
  i1 uuid := 'fb000000-0000-4000-8000-0000000000a1';
  i2 uuid := 'fb000000-0000-4000-8000-0000000000a2';
  i4 uuid := 'fb000000-0000-4000-8000-0000000000a4';
  d1 uuid := 'fb000000-0000-4000-8000-0000000000d1';
  v_m2 uuid := current_setting('p3m.m2')::uuid;
  v_m3 uuid := current_setting('p3m.m3')::uuid;
  v_m4 uuid := current_setting('p3m.m4')::uuid;
  v_m5 uuid := current_setting('p3m.m5')::uuid;
  v_app_i1 uuid;
  v_app_i2 uuid;
  v_o3 uuid;
  v_o_i2 uuid;
  v_active boolean;
  v_blocked boolean;
  v_case text;
  n int;
begin
  -- 준비
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  v_app_i1 := public.apply_to_job(v_m3, null);
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  v_o3 := public.send_offer(v_m3, i4, null);
  perform set_config('request.jwt.claims', json_build_object('sub', i2, 'role', 'authenticated')::text, true);
  v_app_i2 := public.apply_to_job(v_m5, null);
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_o_i2 := public.send_offer(v_m2, i2, null);

  -- 센터 퇴출
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  perform public.admin_set_account_status(c2, 'banned', 'contact_harvesting', '신고 여러 건 확인');
  if coalesce(current_setting('aqua.quiet_user', true), '') <> ''
     or coalesce(current_setting('aqua.action_reason', true), '') <> '' then
    reset role;
    raise exception 'ban_effects 실패 (설정값이 남음)';
  end if;
  reset role;

  select count(*) into n from public.profiles where id = c2 and account_status = 'banned';
  if n <> 1 then raise exception 'ban_effects 실패 (센터 계정 상태)'; end if;
  select count(*) into n from public.job_posts where id in (v_m3, v_m4) and status = 'hidden';
  if n <> 2 then raise exception 'ban_effects 실패 (센터 공고 숨김 %건)', n; end if;
  select count(*) into n from public.job_applications where id = v_app_i1 and status = 'not_selected';
  if n <> 1 then raise exception 'ban_effects 실패 (퇴출 센터 공고의 지원)'; end if;
  select count(*) into n from public.job_offers where id = v_o3 and status = 'expired';
  if n <> 1 then raise exception 'ban_effects 실패 (퇴출 센터가 보낸 제안)'; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i1 and kind = 'application_closed' and link = '/?tab=applications&job=' || v_m3;
  if n <> 1 then raise exception 'ban_effects 실패 (지원자 마감 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i4 and kind = 'offer_expired' and link = '/?tab=offers&offer=' || v_o3;
  if n <> 1 then raise exception 'ban_effects 실패 (제안 받은 강사 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = c2 and kind = 'account_banned' and body = '사유: 연락처 수집 목적';
  if n <> 1 then raise exception 'ban_effects 실패 (퇴출 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications where user_id = c2 and kind = 'job_hidden';
  if n <> 0 then raise exception 'ban_effects 실패 (퇴출 센터가 받은 공고 숨김 알림 %건)', n; end if;
  select count(*) into n from public.admin_actions
    where admin_id = d1 and target_user_id = c2 and action = 'account_banned'
      and reason = 'contact_harvesting' and note = '신고 여러 건 확인';
  if n <> 1 then raise exception 'ban_effects 실패 (관리자 기록 %행)', n; end if;

  -- 퇴출 센터: 활성 아님(앱 차단 화면) · 공고 등록 · 신고 · 푸시 등록 거부
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  select public.is_active() into v_active;
  if v_active then reset role; raise exception 'ban_effects 실패 (퇴출 센터가 활성)'; end if;
  foreach v_case in array array['post', 'report', 'push'] loop
    v_blocked := false;
    begin
      if v_case = 'post' then
        perform public.create_job_post(jsonb_build_object(
          'job_type', 'lesson', 'title', '퇴출 뒤 공고', 'region', '서울',
          'class_date', (now() at time zone 'Asia/Seoul')::date + 10, 'headcount', 1,
          'description', '설명', 'deadline', (now() at time zone 'Asia/Seoul')::date + 9));
      elsif v_case = 'report' then
        perform public.submit_report('job', v_m2, 'illegal', null);
      else
        perform public.aqua_save_push_subscription(
          'https://fcm.googleapis.com/fcm/send/p3m-c2-device', repeat('A', 87), repeat('B', 22));
      end if;
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    if not v_blocked then reset role; raise exception 'ban_effects 실패 (퇴출 센터 %)', v_case; end if;
  end loop;

  -- 공개 목록에서 빠진다
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.list_public_jobs(null, null, false, 100, 0) j where j.id in (v_m3, v_m4);
  if n <> 0 then reset role; raise exception 'ban_effects 실패 (공개 목록에 퇴출 센터 공고 %건)', n; end if;

  -- 강사 퇴출
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  perform public.admin_set_account_status(i2, 'banned', 'fake_document', null);
  reset role;

  select count(*) into n from public.job_applications where id = v_app_i2 and status = 'not_selected';
  if n <> 1 then raise exception 'ban_effects 실패 (퇴출 강사의 지원)'; end if;
  select count(*) into n from public.job_offers where id = v_o_i2 and status = 'expired';
  if n <> 1 then raise exception 'ban_effects 실패 (퇴출 강사가 받은 제안)'; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i2
      and (link = '/?tab=offers&offer=' || v_o_i2 or link = '/?tab=applications&job=' || v_m5);
  if n <> 0 then raise exception 'ban_effects 실패 (퇴출 강사에게 간 마감 알림 %건)', n; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i2 and kind = 'account_banned' and body = '사유: 가짜 서류';
  if n <> 1 then raise exception 'ban_effects 실패 (강사 퇴출 알림 %건)', n; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i2, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(v_m2, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'ban_effects 실패 (퇴출 강사 지원)'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.browse_instructors('{}'::jsonb, 50, 0) b where b.user_id = i2;
  reset role;
  if n <> 0 then raise exception 'ban_effects 실패 (둘러보기에 퇴출 강사 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- admin_cannot_ban_self_or_admin:
--   관리자 D1은 자기 자신 · 다른 관리자 D2를 바꿀 수 없다(42501, 상태 그대로).
--   목록 밖 상태 · 정지 사유 없음 · 기타 설명 없음 · 이미 그 상태는 22023, 없는 회원은 P0002.
-- ---------------------------------------------------------------------
do $$
declare
  d1 uuid := 'fb000000-0000-4000-8000-0000000000d1';
  d2 uuid := 'fb000000-0000-4000-8000-0000000000d2';
  i4 uuid := 'fb000000-0000-4000-8000-0000000000a4';
  v_msg text;
  v_blocked boolean;
  v_case text;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);

  v_msg := null;
  begin
    perform public.admin_set_account_status(d1, 'banned', 'illegal', null);
  exception when insufficient_privilege then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from '내 계정은 바꿀 수 없어요' then
    reset role;
    raise exception 'admin_cannot_ban_self_or_admin 실패 (자기 자신: %)', coalesce(v_msg, '통과');
  end if;

  v_msg := null;
  begin
    perform public.admin_set_account_status(d2, 'suspended', 'illegal', null);
  exception when insufficient_privilege then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from '관리자 계정은 바꿀 수 없어요' then
    reset role;
    raise exception 'admin_cannot_ban_self_or_admin 실패 (다른 관리자: %)', coalesce(v_msg, '통과');
  end if;

  foreach v_case in array array['bad_status', 'no_reason', 'other_no_note', 'same_status', 'missing'] loop
    v_blocked := false;
    begin
      if v_case = 'bad_status' then
        perform public.admin_set_account_status(i4, 'deleted', 'illegal', null);
      elsif v_case = 'no_reason' then
        perform public.admin_set_account_status(i4, 'suspended', null, '사유 없이');
      elsif v_case = 'other_no_note' then
        perform public.admin_set_account_status(i4, 'suspended', 'other', '');
      elsif v_case = 'same_status' then
        perform public.admin_set_account_status(i4, 'active', null, null);
      else
        perform public.admin_set_account_status(gen_random_uuid(), 'suspended', 'illegal', null);
      end if;
    exception
      when invalid_parameter_value then
        v_blocked := v_case <> 'missing';
      when no_data_found then
        v_blocked := v_case = 'missing';
    end;
    if not v_blocked then reset role; raise exception 'admin_cannot_ban_self_or_admin 실패 (입력 %)', v_case; end if;
  end loop;
  reset role;

  select count(*) into n from public.profiles where id in (d1, d2, i4) and account_status = 'active';
  if n <> 3 then raise exception 'admin_cannot_ban_self_or_admin 실패 (상태가 바뀜)'; end if;
  select count(*) into n from public.admin_actions where target_user_id in (d1, d2, i4);
  if n <> 0 then raise exception 'admin_cannot_ban_self_or_admin 실패 (관리자 기록 %행)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- reactivate_restores_access:
--   I1 m2 지원 → 정지(불법 행위): 지원은 그대로(데이터 유지), 정지 알림(사유), 새 지원 거부.
--   → 다시 활성(설명만): 계정 알림 없음, 기록 'account_reactivated', m5 지원 성공, m2 지원 그대로.
--   퇴출된 C2 → 다시 활성: 공고 등록 성공, 숨긴 공고 m3는 그대로 숨김.
-- ---------------------------------------------------------------------
do $$
declare
  c2 uuid := 'fb000000-0000-4000-8000-0000000000c2';
  i1 uuid := 'fb000000-0000-4000-8000-0000000000a1';
  d1 uuid := 'fb000000-0000-4000-8000-0000000000d1';
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_app uuid;
  v_blocked boolean;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  v_app := public.apply_to_job(current_setting('p3m.m2')::uuid, null);

  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  perform public.admin_set_account_status(i1, 'suspended', 'illegal', null);
  reset role;

  select count(*) into n from public.job_applications where id = v_app and status = 'applied';
  if n <> 1 then raise exception 'reactivate_restores_access 실패 (정지 뒤 지원이 바뀜)'; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i1 and kind = 'account_suspended' and body = '사유: 불법 행위';
  if n <> 1 then raise exception 'reactivate_restores_access 실패 (정지 알림 %건)', n; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(current_setting('p3m.m5')::uuid, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'reactivate_restores_access 실패 (정지 중 지원)'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  perform public.admin_set_account_status(i1, 'active', null, '소명 확인');
  reset role;

  select count(*) into n from public.profiles where id = i1 and account_status = 'active';
  if n <> 1 then raise exception 'reactivate_restores_access 실패 (다시 활성 상태)'; end if;
  select count(*) into n from public.aqua_notifications
    where user_id = i1 and kind in ('account_suspended', 'account_banned');
  if n <> 1 then raise exception 'reactivate_restores_access 실패 (계정 알림 %건)', n; end if;
  select count(*) into n from public.admin_actions
    where admin_id = d1 and target_user_id = i1 and action = 'account_reactivated'
      and reason is null and note = '소명 확인';
  if n <> 1 then raise exception 'reactivate_restores_access 실패 (관리자 기록 %행)', n; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', i1, 'role', 'authenticated')::text, true);
  perform public.apply_to_job(current_setting('p3m.m5')::uuid, null);
  reset role;
  select count(*) into n from public.job_applications where id = v_app and status = 'applied';
  if n <> 1 then raise exception 'reactivate_restores_access 실패 (다시 활성 뒤 m2 지원)'; end if;

  -- 퇴출 → 다시 활성
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  perform public.admin_set_account_status(c2, 'active', null, null);
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  perform public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '다시 활성 뒤 공고', 'region', '서울',
    'class_date', v_today + 10, 'headcount', 1, 'description', '설명', 'deadline', v_today + 9));
  reset role;
  select count(*) into n from public.job_posts where id = current_setting('p3m.m3')::uuid and status = 'hidden';
  if n <> 1 then raise exception 'reactivate_restores_access 실패 (숨긴 공고가 되돌아옴)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- resolve_and_list_reports:
--   관리자 목록: 대상 요약(공고 제목·센터명·공고 상태·대상 계정 상태·같은 대상 열린 신고 수), 연락처·서류 칸 없음.
--   C1 → I2 신고를 resolved(처리 메모) → 기록 'report_resolved', 신고자는 상태·처리 시각을 본다.
--   다시 처리 · 목록 밖 결과 · 메모 501자는 22023, 없는 신고는 P0002, 목록 상태 오류 22023.
--   열린 목록(open)에는 처리한 신고가 없다. 기각(dismissed)도 된다.
-- ---------------------------------------------------------------------
do $$
declare
  c1 uuid := 'fb000000-0000-4000-8000-0000000000c1';
  i1 uuid := 'fb000000-0000-4000-8000-0000000000a1';
  i2 uuid := 'fb000000-0000-4000-8000-0000000000a2';
  d1 uuid := 'fb000000-0000-4000-8000-0000000000d1';
  v_report uuid := current_setting('p3m.r_c1_i2')::uuid;
  v_center_report uuid;
  v_args text[];
  v_title text;
  v_center text;
  v_job_status text;
  v_acct text;
  v_open int;
  v_status text;
  v_resolved_at timestamptz;
  v_blocked boolean;
  v_case text;
  n int;
begin
  select f.proargnames into v_args from pg_proc f
  where f.pronamespace = 'public'::regnamespace and f.proname = 'admin_list_reports';
  if v_args && array['phone', 'email', 'file_path', 'bucket', 'meta'] then
    raise exception 'resolve_and_list_reports 실패 (반환 칸 %)', v_args;
  end if;

  select r.id into v_center_report from public.job_reports r
    where r.reporter_id = i1 and r.target_type = 'center' and r.status = 'open'
    order by r.created_at limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);

  -- 공고 신고 요약(m2: I1이 두 번 신고)
  select l.target_title, l.target_center_name, l.target_job_status, l.target_account_status, l.target_open_reports
    into v_title, v_center, v_job_status, v_acct, v_open
  from public.admin_list_reports('open', 200) l
  where l.target_type = 'job' and l.target_id = current_setting('p3m.m2')::uuid
  limit 1;
  if v_title is distinct from '신고 공고 m2' or v_center is distinct from '신고센터1'
     or v_job_status is distinct from 'open' or v_acct is distinct from 'active' or v_open is distinct from 2 then
    reset role;
    raise exception 'resolve_and_list_reports 실패 (공고 요약 % % % % %)', v_title, v_center, v_job_status, v_acct, v_open;
  end if;

  -- 회원 신고 요약(I2 퇴출됨)
  select l.target_title, l.target_account_status into v_title, v_acct
  from public.admin_list_reports(null, 200) l where l.id = v_report;
  if v_title is distinct from '신고강사2' or v_acct is distinct from 'banned' then
    reset role;
    raise exception 'resolve_and_list_reports 실패 (회원 요약 % %)', v_title, v_acct;
  end if;

  -- 센터 신고 요약
  select l.target_title into v_title from public.admin_list_reports(null, 200) l where l.id = v_center_report;
  if v_title is distinct from '신고센터1' then
    reset role;
    raise exception 'resolve_and_list_reports 실패 (센터 요약 %)', v_title;
  end if;

  -- 처리
  perform public.admin_resolve_report(v_report, 'resolved', '퇴출 조치함');
  foreach v_case in array array['again', 'bad_status', 'memo_501', 'missing', 'bad_list'] loop
    v_blocked := false;
    begin
      if v_case = 'again' then
        perform public.admin_resolve_report(v_report, 'dismissed', null);
      elsif v_case = 'bad_status' then
        perform public.admin_resolve_report(v_center_report, 'closed', null);
      elsif v_case = 'memo_501' then
        perform public.admin_resolve_report(v_center_report, 'dismissed', repeat('가', 501));
      elsif v_case = 'missing' then
        perform public.admin_resolve_report(gen_random_uuid(), 'dismissed', null);
      else
        perform * from public.admin_list_reports('closed');
      end if;
    exception
      when invalid_parameter_value then
        v_blocked := v_case <> 'missing';
      when no_data_found then
        v_blocked := v_case = 'missing';
    end;
    if not v_blocked then reset role; raise exception 'resolve_and_list_reports 실패 (입력 %)', v_case; end if;
  end loop;

  select count(*) into n from public.admin_list_reports('open', 200) l where l.id = v_report;
  if n <> 0 then reset role; raise exception 'resolve_and_list_reports 실패 (열린 목록에 처리한 신고)'; end if;

  perform public.admin_resolve_report(v_center_report, 'dismissed', null);
  reset role;

  select count(*) into n from public.admin_actions
    where admin_id = d1 and target_user_id = i2 and action = 'report_resolved'
      and reason = 'fake_document' and note = '퇴출 조치함';
  if n <> 1 then raise exception 'resolve_and_list_reports 실패 (처리 기록 %행)', n; end if;
  select count(*) into n from public.admin_actions
    where admin_id = d1 and target_user_id = c1 and action = 'report_dismissed';
  if n <> 1 then raise exception 'resolve_and_list_reports 실패 (기각 기록 %행)', n; end if;

  -- 신고한 C1은 처리 상태·시각을 본다
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  select r.status, r.resolved_at into v_status, v_resolved_at from public.job_reports r where r.id = v_report;
  reset role;
  if v_status is distinct from 'resolved' or v_resolved_at is null then
    raise exception 'resolve_and_list_reports 실패 (신고자가 본 상태 %)', v_status;
  end if;
end $$;

rollback;

select 'moderation ok' as result;
