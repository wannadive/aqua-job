-- =====================================================================
-- 아쿠아잡 006 핀프렌즈 합류 대비 검사 (개발/테스트 전용) — 006 적용 후 실행
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- 모든 작업은 begin … rollback 안에서 하므로 데이터가 남지 않는다.
-- 성공하면 마지막에 'merge ok' 한 줄이 나온다. 실패하면 '<검사 이름> 실패' 오류가 나온다.
--
-- 검사 사이에 만든 공고 id는 트랜잭션 설정값(merge.*)에 담아 넘긴다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 준비: 테스트 사용자. auth.users에 넣으면 가입 트리거가 돈다(→ 센터는 centers 행도 생긴다).
--   C1 = f6000000-0000-4000-8000-0000000000c1 (센터, 사업자등록증 확인)
--   C2 = f6000000-0000-4000-8000-0000000000c2 (센터, 센터 소개 없음)
--   I1 = f6000000-0000-4000-8000-0000000000a1 (강사)
--   I2 = f6000000-0000-4000-8000-0000000000a2 (강사 → 뒤에서 센터 역할 추가)
--   A  = f6000000-0000-4000-8000-0000000000d1 (관리자 + 강사 + 센터, 사업자등록증 확인)
-- ---------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f6000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'merge-c1@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"센터회원1","phone":"010-6000-0001"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f6000000-0000-4000-8000-0000000000c2',
   'authenticated', 'authenticated', 'merge-c2@aquajob.test', '', now(),
   '{}', '{"role":"center","display_name":"센터회원2","phone":"010-6000-0002"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f6000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'merge-i1@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사1","phone":"010-6000-0003"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f6000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'merge-i2@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"강사2","phone":"010-6000-0004"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f6000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'merge-d@aquajob.test', '', now(),
   '{}', '{"role":"instructor","display_name":"관리자A"}', now(), now());

-- 관리자 지정·여러 역할은 운영과 같은 방식(postgres 세션의 update)으로 한다.
update public.profiles set roles = array['admin', 'instructor', 'center'], role = 'admin'
  where id = 'f6000000-0000-4000-8000-0000000000d1';

-- 무료 기간에서 시작한다(운영 값이 무엇이든 이 트랜잭션 안에서만)
update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

insert into public.center_profiles (user_id, center_name, address) values
  ('f6000000-0000-4000-8000-0000000000c1', '머지다이브', '서울시 1');

-- 서류(제출 상태로 넣고 functions_use_new_tables에서 관리자가 확인한다)
insert into public.verification_documents (id, owner_id, doc_type, file_path, meta) values
  ('f6d00000-0000-4000-8000-0000000000c1', 'f6000000-0000-4000-8000-0000000000c1',
   'business_registration', 'f6000000-0000-4000-8000-0000000000c1/biz.jpg', '{}'),
  ('f6d00000-0000-4000-8000-0000000000d1', 'f6000000-0000-4000-8000-0000000000d1',
   'business_registration', 'f6000000-0000-4000-8000-0000000000d1/biz.jpg', '{}');

-- ---------------------------------------------------------------------
-- renamed_tables_exist_old_gone: 새 이름 테이블은 있고 옛 이름은 없다.
--   제약·인덱스·정책·트리거 이름에도 옛 접두어가 남지 않는다. 함수 본문에 옛 테이블 이름이 없다.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  if to_regclass('public.talent_profiles') is null
     or to_regclass('public.verification_documents') is null
     or to_regclass('public.verification_requirements') is null
     or to_regclass('public.aqua_settings') is null
     or to_regclass('public.admin_actions') is null then
    raise exception 'renamed_tables_exist_old_gone 실패 (새 테이블 없음)';
  end if;
  if to_regclass('public.instructor_profiles') is not null
     or to_regclass('public.documents') is not null
     or to_regclass('public.requirement_rules') is not null
     or to_regclass('public.app_settings') is not null then
    raise exception 'renamed_tables_exist_old_gone 실패 (옛 테이블 남음)';
  end if;

  select count(*) into n from pg_constraint c
  where c.conrelid in ('public.talent_profiles'::regclass, 'public.verification_documents'::regclass,
                       'public.verification_requirements'::regclass, 'public.aqua_settings'::regclass)
    and (left(c.conname, 20) = 'instructor_profiles_' or left(c.conname, 10) = 'documents_'
         or left(c.conname, 18) = 'requirement_rules_' or left(c.conname, 13) = 'app_settings_');
  if n <> 0 then raise exception 'renamed_tables_exist_old_gone 실패 (옛 제약 이름 %개)', n; end if;

  select count(*) into n from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename in ('talent_profiles', 'verification_documents', 'verification_requirements', 'aqua_settings')
    and (left(i.indexname, 20) = 'instructor_profiles_' or left(i.indexname, 10) = 'documents_'
         or left(i.indexname, 18) = 'requirement_rules_' or left(i.indexname, 13) = 'app_settings_');
  if n <> 0 then raise exception 'renamed_tables_exist_old_gone 실패 (옛 인덱스 이름 %개)', n; end if;

  select count(*) into n from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('talent_profiles', 'verification_documents', 'verification_requirements', 'aqua_settings')
    and left(p.policyname, length(p.tablename) + 1) <> p.tablename || '_';
  if n <> 0 then raise exception 'renamed_tables_exist_old_gone 실패 (옛 정책 이름 %개)', n; end if;

  select count(*) into n from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'talent_profiles'
    and p.policyname in ('talent_profiles_select', 'talent_profiles_insert_own', 'talent_profiles_update_own');
  if n <> 3 then raise exception 'renamed_tables_exist_old_gone 실패 (talent_profiles 정책 %개)', n; end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.talent_profiles'::regclass and tgname = 'talent_profiles_set_updated_at'
  ) then
    raise exception 'renamed_tables_exist_old_gone 실패 (updated_at 트리거 이름)';
  end if;

  -- 함수 본문(public 스키마)에 옛 테이블 이름이 남아 있으면 부를 때 깨진다
  select count(*) into n
  from pg_proc f
  where f.pronamespace = 'public'::regnamespace
    and (f.prosrc ~ '\m(instructor_profiles|requirement_rules|app_settings)\M'
         or f.prosrc ~ 'public\.documents\M');
  if n <> 0 then raise exception 'renamed_tables_exist_old_gone 실패 (옛 이름을 쓰는 함수 %개)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- functions_use_new_tables: 이름이 바뀐 테이블을 읽고 쓰는 함수가 실제로 돈다.
--   review_document(verification_documents) → has_requirements(verification_requirements)
--   → effective_doc · get_public_facts(verification_documents) · paid_mode(aqua_settings)
--   · can_view_profile(talent_profiles)
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
  v_id uuid;
  v_type text;
  v_paid boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  perform public.review_document('f6d00000-0000-4000-8000-0000000000c1', 'verified', null, null);
  perform public.review_document('f6d00000-0000-4000-8000-0000000000d1', 'verified', null, null);
  v_paid := public.paid_mode();
  if v_paid then raise exception 'functions_use_new_tables 실패 (paid_mode가 true)'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_ok := public.has_requirements('f6000000-0000-4000-8000-0000000000c1', 'post_lesson');
  if not v_ok then raise exception 'functions_use_new_tables 실패 (has_requirements)'; end if;
  v_ok := public.has_requirements('f6000000-0000-4000-8000-0000000000c1', 'post_tour');
  if v_ok then raise exception 'functions_use_new_tables 실패 (여행업 없이 post_tour 충족)'; end if;

  v_id := (public.effective_doc('f6000000-0000-4000-8000-0000000000c1', 'business_registration')).id;
  if v_id is distinct from 'f6d00000-0000-4000-8000-0000000000c1'::uuid then
    raise exception 'functions_use_new_tables 실패 (effective_doc %)', v_id;
  end if;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select f.doc_type into v_type from public.get_public_facts('f6000000-0000-4000-8000-0000000000c1') f;
  reset role;
  if v_type is distinct from 'business_registration' then
    raise exception 'functions_use_new_tables 실패 (get_public_facts %)', v_type;
  end if;

  -- 강사 이력서(talent_profiles): 공개 강사의 이름은 센터가 본다
  insert into public.talent_profiles (user_id, is_public) values ('f6000000-0000-4000-8000-0000000000a1', true);
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_ok := public.can_view_profile('f6000000-0000-4000-8000-0000000000a1');
  reset role;
  if not v_ok then raise exception 'functions_use_new_tables 실패 (can_view_profile)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- centers_backfilled_and_auto_created: 센터 역할 계정마다 centers 행(백필 + 가입 트리거),
--   center_profiles.center_id는 주인의 센터, center_name을 바꾸면 centers.name도 바뀐다.
--   강사에게 센터 역할을 주면 centers 행이 생긴다. 누구나 id·name·kind만 읽고, 직접 쓰기는 거부.
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_c1 uuid;
  v_c2 uuid;
  v_name text;
  v_kind text;
  v_blocked boolean := false;
begin
  -- 운영 데이터까지 포함해: 센터 역할이 있는데 centers 행이 없는 계정은 없다(백필)
  select count(*) into n from public.profiles p
  where 'center' = any(p.roles)
    and not exists (select 1 from public.centers c where c.owner_user_id = p.id);
  if n <> 0 then raise exception 'centers_backfilled_and_auto_created 실패 (centers 없는 센터 %명)', n; end if;

  -- center_profiles.center_id는 주인의 centers.id
  select count(*) into n from public.center_profiles cp
  where cp.center_id is distinct from (select c.id from public.centers c where c.owner_user_id = cp.user_id);
  if n <> 0 then raise exception 'centers_backfilled_and_auto_created 실패 (center_id 어긋남 %행)', n; end if;

  -- 가입 트리거: 새 센터 C2는 회원 이름으로, C1은 센터 이름으로
  select c.id, c.name, c.kind into v_c2, v_name, v_kind
  from public.centers c where c.owner_user_id = 'f6000000-0000-4000-8000-0000000000c2';
  if v_c2 is null or v_name is distinct from '센터회원2' or v_kind is distinct from 'listing' then
    raise exception 'centers_backfilled_and_auto_created 실패 (새 센터 %, %, %)', v_c2, v_name, v_kind;
  end if;
  select c.id, c.name into v_c1, v_name
  from public.centers c where c.owner_user_id = 'f6000000-0000-4000-8000-0000000000c1';
  if v_name is distinct from '머지다이브' then
    raise exception 'centers_backfilled_and_auto_created 실패 (센터 이름 %)', v_name;
  end if;
  perform set_config('merge.c1', v_c1::text, true);
  perform set_config('merge.c2', v_c2::text, true);

  -- 관리자 A(여러 역할)도 센터 행이 있다
  select count(*) into n from public.centers where owner_user_id = 'f6000000-0000-4000-8000-0000000000d1';
  if n <> 1 then raise exception 'centers_backfilled_and_auto_created 실패 (관리자 센터 %행)', n; end if;

  -- 강사 I2에게 센터 역할을 주면 centers 행이 생긴다
  select count(*) into n from public.centers where owner_user_id = 'f6000000-0000-4000-8000-0000000000a2';
  if n <> 0 then raise exception 'centers_backfilled_and_auto_created 실패 (강사에게 센터 행)'; end if;
  update public.profiles set roles = array['instructor', 'center'] where id = 'f6000000-0000-4000-8000-0000000000a2';
  select count(*) into n from public.centers where owner_user_id = 'f6000000-0000-4000-8000-0000000000a2';
  if n <> 1 then raise exception 'centers_backfilled_and_auto_created 실패 (역할 추가 후 %행)', n; end if;

  -- 본인 C2가 센터 소개를 만들면(upsert) 이름이 맞춰지고, 다른 센터 id를 넣어도 자기 센터로 고정된다
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  insert into public.center_profiles (user_id, center_name, center_id)
  values ('f6000000-0000-4000-8000-0000000000c2', '둘째다이브', v_c1);
  -- 이름 칸 없이 다른 칸만 upsert해도 이름은 그대로
  insert into public.center_profiles (user_id, teaching_time)
  values ('f6000000-0000-4000-8000-0000000000c2', '주말')
  on conflict (user_id) do update set teaching_time = excluded.teaching_time;
  reset role;

  select c.name into v_name from public.centers c where c.id = v_c2;
  if v_name is distinct from '둘째다이브' then
    raise exception 'centers_backfilled_and_auto_created 실패 (이름 동기화 %)', v_name;
  end if;
  select count(*) into n from public.center_profiles
  where user_id = 'f6000000-0000-4000-8000-0000000000c2' and center_id = v_c2;
  if n <> 1 then raise exception 'centers_backfilled_and_auto_created 실패 (center_id 고정)'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000c2', 'role', 'authenticated')::text, true);
  update public.center_profiles set center_name = '셋째다이브'
  where user_id = 'f6000000-0000-4000-8000-0000000000c2';
  reset role;
  select c.name into v_name from public.centers c where c.id = v_c2;
  if v_name is distinct from '셋째다이브' then
    raise exception 'centers_backfilled_and_auto_created 실패 (이름 변경 %)', v_name;
  end if;

  -- 비로그인도 id·name·kind는 읽는다, owner_user_id는 못 읽는다
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select c.name into v_name from public.centers c where c.id = v_c1;
  if v_name is distinct from '머지다이브' then
    reset role;
    raise exception 'centers_backfilled_and_auto_created 실패 (비로그인 이름 %)', v_name;
  end if;
  begin
    perform c.owner_user_id from public.centers c where c.id = v_c1;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'centers_backfilled_and_auto_created 실패 (owner_user_id 읽힘)'; end if;

  -- 로그인 사용자도 centers에 직접 쓸 수 없다
  v_blocked := false;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  begin
    insert into public.centers (owner_user_id, name) values ('f6000000-0000-4000-8000-0000000000a1', '가짜');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'centers_backfilled_and_auto_created 실패 (직접 insert)'; end if;
end $$;

-- ---------------------------------------------------------------------
-- job_posts_center_id_not_null_and_set_on_create: job_posts.center_id는 NOT NULL이고
--   create_job_post가 호출자의 centers.id로 채운다. 요약·센터 RPC가 center_id를 내보내고 centers.id로 찾는다.
--   merge.job = C1 수업 공고
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_id uuid;
  v_center uuid;
  v_user uuid;
  v_name text;
  n int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_posts' and column_name = 'center_id' and is_nullable = 'NO'
  ) then
    raise exception 'job_posts_center_id_not_null_and_set_on_create 실패 (NULL 허용)';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v_id := public.create_job_post(jsonb_build_object(
    'job_type', 'lesson', 'title', '머지 수업 공고', 'region', '서울',
    'class_date', v_today + 7, 'headcount', 2, 'description', '설명', 'deadline', v_today + 6));
  perform set_config('merge.job', v_id::text, true);
  reset role;

  select j.center_id into v_center from public.job_posts j where j.id = v_id;
  if v_center is distinct from current_setting('merge.c1')::uuid then
    raise exception 'job_posts_center_id_not_null_and_set_on_create 실패 (center_id %)', v_center;
  end if;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select s.center_id into v_center from public.list_public_jobs(null, null, false, 100, 0) s where s.id = v_id;
  if v_center is distinct from current_setting('merge.c1')::uuid then
    reset role;
    raise exception 'job_posts_center_id_not_null_and_set_on_create 실패 (목록 center_id %)', v_center;
  end if;
  v_center := null;
  select s.center_id into v_center from public.get_job_summary(v_id) s;
  if v_center is distinct from current_setting('merge.c1')::uuid then
    reset role;
    raise exception 'job_posts_center_id_not_null_and_set_on_create 실패 (요약 center_id %)', v_center;
  end if;

  -- 007부터 user_id(주인 회원 id)는 주인·관리자에게만 — 비로그인은 null
  select p.center_id, p.user_id, p.center_name into v_center, v_user, v_name
  from public.get_center_public_profile(current_setting('merge.c1')::uuid) p;
  if v_center is distinct from current_setting('merge.c1')::uuid
     or v_user is not null
     or v_name is distinct from '머지다이브' then
    reset role;
    raise exception 'job_posts_center_id_not_null_and_set_on_create 실패 (센터 프로필 %, %, %)', v_center, v_user, v_name;
  end if;
  -- 회원 id로는 찾지 않는다(centers.id로만)
  select count(*) into n from public.get_center_public_profile('f6000000-0000-4000-8000-0000000000c1');
  if n <> 0 then
    reset role;
    raise exception 'job_posts_center_id_not_null_and_set_on_create 실패 (회원 id로 찾힘)';
  end if;

  select count(*) into n from public.list_center_job_history(current_setting('merge.c1')::uuid) h
  where h.id = v_id and h.center_id = current_setting('merge.c1')::uuid;
  reset role;
  if n <> 1 then raise exception 'job_posts_center_id_not_null_and_set_on_create 실패 (공고 이력 %행)', n; end if;

  -- 로그인 강사는 get_job_detail로 center_id를 받는다
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_center := null;
  select d.center_id into v_center from public.get_job_detail(v_id) d;
  reset role;
  if v_center is distinct from current_setting('merge.c1')::uuid then
    raise exception 'job_posts_center_id_not_null_and_set_on_create 실패 (상세 center_id %)', v_center;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- entitlement_free_period_true: 무료 기간에는 강사·센터 구독 함수가 true.
--   모르는 상품은 false. 남의 권한은 물어볼 수 없다(false).
-- ---------------------------------------------------------------------
do $$
declare
  v boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v := public.user_has_product('f6000000-0000-4000-8000-0000000000a1', 'aquajob_talent');
  if not v then reset role; raise exception 'entitlement_free_period_true 실패 (강사 구독)'; end if;
  v := public.user_has_product('f6000000-0000-4000-8000-0000000000a1', 'nope');
  if v then reset role; raise exception 'entitlement_free_period_true 실패 (모르는 상품)'; end if;
  v := public.center_has_product(current_setting('merge.c1')::uuid, 'aquajob');
  if v then reset role; raise exception 'entitlement_free_period_true 실패 (남의 센터 권한을 물음)'; end if;
  v := public.user_has_product('f6000000-0000-4000-8000-0000000000c1', 'aquajob_talent');
  if v then reset role; raise exception 'entitlement_free_period_true 실패 (남의 구독을 물음)'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  v := public.center_has_product(current_setting('merge.c1')::uuid, 'aquajob');
  if not v then reset role; raise exception 'entitlement_free_period_true 실패 (센터 구독)'; end if;
  v := public.can_view_job_detail(null);
  if not v then reset role; raise exception 'entitlement_free_period_true 실패 (센터 상세 열람)'; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- entitlement_paid_mode_blocks_post_and_apply: 유료 전환(paid_mode=true) 후
--   센터 C1은 공고 등록 거부, 강사 I1은 지원·상세 거부, 공고 주인 C1은 자기 공고 상세를 본다.
--   관리자 A(관리자 + 강사 + 센터)는 공고 등록·지원 모두 된다.
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_payload jsonb := jsonb_build_object(
    'job_type', 'lesson', 'title', '유료 전환 후 공고', 'region', '서울',
    'class_date', v_today + 7, 'headcount', 1, 'description', '설명', 'deadline', v_today + 6);
  v_blocked boolean := false;
  v_id uuid;
  v_desc text;
  n int;
begin
  update public.aqua_settings set value = 'true'::jsonb where key = 'paid_mode';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  begin
    perform public.create_job_post(v_payload);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'entitlement_paid_mode_blocks_post_and_apply 실패 (센터 등록)'; end if;

  -- 공고 주인은 자기 공고 상세를 본다
  select d.description into v_desc from public.get_job_detail(current_setting('merge.job')::uuid) d;
  if v_desc is distinct from '설명' then
    reset role;
    raise exception 'entitlement_paid_mode_blocks_post_and_apply 실패 (주인 상세 %)', v_desc;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.apply_to_job(current_setting('merge.job')::uuid, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'entitlement_paid_mode_blocks_post_and_apply 실패 (강사 지원)'; end if;
  v_blocked := false;
  begin
    perform * from public.get_job_detail(current_setting('merge.job')::uuid);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'entitlement_paid_mode_blocks_post_and_apply 실패 (강사 상세)'; end if;

  -- 관리자 A는 등록·지원 모두 된다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  v_id := public.create_job_post(v_payload);
  perform public.apply_to_job(current_setting('merge.job')::uuid, '관리자 지원');
  reset role;

  select count(*) into n from public.job_posts
  where id = v_id and center_id = (select c.id from public.centers c where c.owner_user_id = 'f6000000-0000-4000-8000-0000000000d1');
  if n <> 1 then raise exception 'entitlement_paid_mode_blocks_post_and_apply 실패 (관리자 공고 %행)', n; end if;
  select count(*) into n from public.job_applications
  where job_id = current_setting('merge.job')::uuid and instructor_id = 'f6000000-0000-4000-8000-0000000000d1';
  if n <> 1 then raise exception 'entitlement_paid_mode_blocks_post_and_apply 실패 (관리자 지원 %행)', n; end if;
  select count(*) into n from public.job_applications
  where job_id = current_setting('merge.job')::uuid and instructor_id = 'f6000000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'entitlement_paid_mode_blocks_post_and_apply 실패 (강사 지원 %행)', n; end if;

  update public.aqua_settings set value = 'false'::jsonb where key = 'paid_mode';

  -- 무료 기간으로 돌아오면 강사 I1도 지원된다
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  perform public.apply_to_job(current_setting('merge.job')::uuid, null);
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- verification_docs_bucket_policies: verification-docs 버킷은 본인 폴더에만 올리고,
--   다른 사용자는 못 읽고, 관리자는 읽는다. 새 서류 행은 bucket='verification-docs'이고
--   옛 버킷('documents')을 가리키는 새 행은 거부된다.
-- ---------------------------------------------------------------------
do $$
declare
  v_blocked boolean := false;
  n int;
  v_bucket text;
begin
  if not exists (select 1 from storage.buckets where id = 'verification-docs' and not public) then
    raise exception 'verification_docs_bucket_policies 실패 (비공개 버킷 없음)';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name, owner)
  values ('verification-docs', 'f6000000-0000-4000-8000-0000000000a1/cert.jpg', 'f6000000-0000-4000-8000-0000000000a1');

  -- 남의 폴더에는 못 올린다
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('verification-docs', 'f6000000-0000-4000-8000-0000000000c1/fake.jpg', 'f6000000-0000-4000-8000-0000000000a1');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'verification_docs_bucket_policies 실패 (남의 폴더 업로드)'; end if;

  select count(*) into n from storage.objects
  where bucket_id = 'verification-docs' and name = 'f6000000-0000-4000-8000-0000000000a1/cert.jpg';
  if n <> 1 then reset role; raise exception 'verification_docs_bucket_policies 실패 (본인 파일 %행)', n; end if;

  -- 서류 행: 기본 버킷은 verification-docs, 옛 버킷을 가리키면 거부
  insert into public.verification_documents (id, owner_id, doc_type, file_path)
  values ('f6d00000-0000-4000-8000-0000000000a1', 'f6000000-0000-4000-8000-0000000000a1',
          'instructor_cert', 'f6000000-0000-4000-8000-0000000000a1/cert.jpg');
  v_blocked := false;
  begin
    insert into public.verification_documents (owner_id, doc_type, file_path, bucket)
    values ('f6000000-0000-4000-8000-0000000000a1', 'first_aid',
            'f6000000-0000-4000-8000-0000000000a1/cpr.jpg', 'documents');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then reset role; raise exception 'verification_docs_bucket_policies 실패 (옛 버킷 행 등록)'; end if;

  -- 다른 사용자(센터 C1)는 못 읽는다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects
  where bucket_id = 'verification-docs' and name like 'f6000000-0000-4000-8000-0000000000a1/%';
  if n <> 0 then reset role; raise exception 'verification_docs_bucket_policies 실패 (남이 파일 %행 봄)', n; end if;

  -- 관리자는 읽는다
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'f6000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects
  where bucket_id = 'verification-docs' and name = 'f6000000-0000-4000-8000-0000000000a1/cert.jpg';
  reset role;
  if n <> 1 then raise exception 'verification_docs_bucket_policies 실패 (관리자 파일 %행)', n; end if;

  select d.bucket into v_bucket from public.verification_documents d where d.id = 'f6d00000-0000-4000-8000-0000000000a1';
  if v_bucket is distinct from 'verification-docs' then
    raise exception 'verification_docs_bucket_policies 실패 (기본 버킷 %)', v_bucket;
  end if;
end $$;

rollback;

select 'merge ok' as result;
