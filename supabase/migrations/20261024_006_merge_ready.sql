-- =====================================================================
-- 아쿠아잡 006: 핀프렌즈 합류 대비 DB 정리 + 구독 권한 자리
-- 001 → 002 → 003 → 004 → 005를 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(to_regclass·카탈로그로 이름 변경 확인, if not exists,
-- drop policy if exists → create policy, create or replace, 시그니처가 바뀌는 함수는 drop → create).
--
-- 1) 이름 바꾸기(핀프렌즈 테이블과 겹치지 않게 도메인 접두어)
--      instructor_profiles → talent_profiles
--      documents           → verification_documents
--      requirement_rules   → verification_requirements
--      app_settings        → aqua_settings          (admin_actions는 그대로 — 합칠 때 병합)
--    제약·인덱스·트리거·정책 이름도 새 테이블 이름으로 바꾼다.
--    함수 본문은 테이블을 이름(글자)으로 기억하므로, 옛 이름을 쓰는 함수는 전부 최신 정의
--    (005 > 004 > 003 > 002 > 001)를 복사해 새 이름으로 다시 만든다:
--      effective_doc(004) · has_requirements(004) · review_document(001) · can_view_profile(005)
--      · paid_mode(005) · get_public_facts(005)
--    정책 본문(예: talent_profiles_select)은 테이블을 번호로 기억해 이름 변경을 자동으로 따라간다.
-- 2) Storage: 비공개 버킷 verification-docs를 새로 만들고 documents 버킷과 같은 정책(002 기준)을 건다.
--    verification_documents.bucket 칸: 기존 행(테스트 데이터)은 'documents', 새 행은 'verification-docs'.
--    SQL로 Storage 객체를 옮기지 않는다. 옛 documents 버킷과 정책은 테스트 파일을 다 지운 뒤 없앤다.
-- 3) centers(센터 = 테넌트 자리): 센터 역할 계정마다 한 행. center_profiles.center_id,
--    job_posts.center_id(NOT NULL). 센터 공개 RPC는 centers.id로 찾는다.
-- 4) 구독 권한 자리: center_has_product / user_has_product.
--    무료 기간(aqua_settings.paid_mode=false)에는 모두 true, 유료 전환 후에는 결제 표가 생길 때까지
--    운영자(관리자) 계정만 true. 상품: 'aquajob'(센터 공고·제안), 'aquajob_talent'(강사 상세·지원),
--    'center_app'(센터앱, 예약). 공고 등록·상세 열람·지원이 이 함수로 관문을 통과한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테이블 이름 바꾸기
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('public.instructor_profiles') is not null and to_regclass('public.talent_profiles') is null then
    alter table public.instructor_profiles rename to talent_profiles;
  end if;
  if to_regclass('public.documents') is not null and to_regclass('public.verification_documents') is null then
    alter table public.documents rename to verification_documents;
  end if;
  if to_regclass('public.requirement_rules') is not null and to_regclass('public.verification_requirements') is null then
    alter table public.requirement_rules rename to verification_requirements;
  end if;
  if to_regclass('public.app_settings') is not null and to_regclass('public.aqua_settings') is null then
    alter table public.app_settings rename to aqua_settings;
  end if;
end $$;

-- 제약(pkey·fkey·check)·인덱스·정책 이름: 옛 접두어로 시작하는 것만 새 접두어로.
-- (LIKE의 '_'는 아무 글자나 맞으므로 left()로 정확히 비교한다)
do $$
declare
  t record;
  r record;
begin
  for t in
    select * from (values
      ('talent_profiles', 'instructor_profiles_'),
      ('verification_documents', 'documents_'),
      ('verification_requirements', 'requirement_rules_'),
      ('aqua_settings', 'app_settings_')
    ) v(tbl, old_prefix)
  loop
    -- 제약(인덱스를 가진 pkey는 인덱스 이름도 같이 바뀐다)
    for r in
      select c.conname
      from pg_constraint c
      where c.conrelid = format('public.%I', t.tbl)::regclass
        and left(c.conname, length(t.old_prefix)) = t.old_prefix
    loop
      execute format('alter table public.%I rename constraint %I to %I',
        t.tbl, r.conname, t.tbl || '_' || substr(r.conname, length(t.old_prefix) + 1));
    end loop;

    -- 제약에 딸리지 않은 인덱스(예: documents_owner_type_idx)
    for r in
      select i.relname
      from pg_index x
      join pg_class i on i.oid = x.indexrelid
      where x.indrelid = format('public.%I', t.tbl)::regclass
        and left(i.relname, length(t.old_prefix)) = t.old_prefix
    loop
      execute format('alter index public.%I rename to %I',
        r.relname, t.tbl || '_' || substr(r.relname, length(t.old_prefix) + 1));
    end loop;

    -- 정책
    for r in
      select p.policyname
      from pg_policies p
      where p.schemaname = 'public' and p.tablename = t.tbl
        and left(p.policyname, length(t.old_prefix)) = t.old_prefix
    loop
      execute format('alter policy %I on public.%I rename to %I',
        r.policyname, t.tbl, t.tbl || '_' || substr(r.policyname, length(t.old_prefix) + 1));
    end loop;
  end loop;

  -- updated_at 트리거
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.talent_profiles'::regclass and tgname = 'instructor_profiles_set_updated_at'
  ) then
    alter trigger instructor_profiles_set_updated_at on public.talent_profiles
      rename to talent_profiles_set_updated_at;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. verification_documents.bucket + 새 버킷 verification-docs
-- ---------------------------------------------------------------------

-- 칸을 처음 만들 때만 기존 행을 'documents'(옛 버킷)로 채우고, 그 뒤 기본값을 새 버킷으로 바꾼다.
-- (다시 실행해도 새 행을 옛 버킷으로 덮어쓰지 않는다)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'verification_documents' and column_name = 'bucket'
  ) then
    alter table public.verification_documents add column bucket text not null default 'documents';
  end if;
  alter table public.verification_documents alter column bucket set default 'verification-docs';
end $$;

alter table public.verification_documents drop constraint if exists verification_documents_bucket_check;
alter table public.verification_documents add constraint verification_documents_bucket_check
  check (bucket in ('verification-docs', 'documents'));

-- 등록 정책(003 정의 기준) + 새 서류는 새 버킷(verification-docs)에만
-- (서류 종류 목록은 lib/verification/config.ts의 DOC_TYPES.owner와 같아야 한다)
drop policy if exists documents_insert_own_submitted on public.verification_documents;
drop policy if exists verification_documents_insert_own_submitted on public.verification_documents;
create policy verification_documents_insert_own_submitted on public.verification_documents
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.is_active())
    and status = 'submitted'
    and valid_until is null
    and reject_reason is null
    and reviewed_by is null
    and verified_at is null
    and bucket = 'verification-docs'
    and file_path is not null
    and split_part(file_path, '/', 1) = (select auth.uid())::text
    and submitted_at <= now() + interval '1 minute'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and (
          ('instructor' = any(p.roles)
           and verification_documents.doc_type in ('instructor_cert', 'liability_insurance', 'first_aid', 'id_card'))
          or ('center' = any(p.roles)
           and verification_documents.doc_type in ('business_registration', 'travel_business', 'representative_id', 'rep_instructor_cert'))
        )
    )
  );

-- verification-docs(비공개): {owner_id}/{uuid}.{ext} — 본인 올리기·보기·지우기(활성일 때), 관리자 보기·지우기
-- documents 버킷 정책(001 + 002)을 그대로 옮겼다. 옛 documents 버킷·정책은 테스트 파일 정리 후 없앤다.
insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists verification_docs_owner_insert on storage.objects;
create policy verification_docs_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active())
  );

drop policy if exists verification_docs_owner_select on storage.objects;
create policy verification_docs_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists verification_docs_owner_delete on storage.objects;
create policy verification_docs_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active())
  );

drop policy if exists verification_docs_admin_select on storage.objects;
create policy verification_docs_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-docs' and (select public.is_admin()));

drop policy if exists verification_docs_admin_delete on storage.objects;
create policy verification_docs_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'verification-docs' and (select public.is_admin()));

-- ---------------------------------------------------------------------
-- 3. 옛 테이블 이름을 쓰던 함수 다시 만들기 (최신 정의 복사, 이름만 바꿈)
-- ---------------------------------------------------------------------

-- effective_doc (004 정의 기준). SECURITY INVOKER: 직접 부르면 verification_documents RLS(본인·관리자).
-- 반환 형식은 verification_documents 행(테이블 이름을 바꾸면 형식도 따라 바뀐다).
create or replace function public.effective_doc(p_user uuid, p_doc_type text)
returns public.verification_documents
language sql
stable
set search_path = public
as $$
  select x.*
  from (
    select d.*
    from public.verification_documents d
    where d.owner_id = p_user
      and d.doc_type = p_doc_type
      and d.status = 'verified'
    order by d.verified_at desc nulls last, d.submitted_at desc
    limit 1
  ) x
  where x.valid_until is null
     or x.valid_until >= (now() at time zone 'Asia/Seoul')::date;
$$;

revoke execute on function public.effective_doc(uuid, text) from public, anon;
grant execute on function public.effective_doc(uuid, text) to authenticated;

-- has_requirements (004 정의 기준)
create or replace function public.has_requirements(p_user uuid, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user is distinct from auth.uid() and not public.is_admin() then
    raise exception '본인 요건만 확인할 수 있어요' using errcode = '42501';
  end if;

  return not exists (
    select 1
    from public.verification_requirements r
    where r.action = p_action
      and (public.effective_doc(p_user, r.doc_type)).id is null
  );
end;
$$;

revoke execute on function public.has_requirements(uuid, text) from public, anon;
grant execute on function public.has_requirements(uuid, text) to authenticated;

-- review_document (001 정의 기준 — 002~005는 바꾸지 않았다)
-- 신분증 원본은 이 RPC가 지우지 않는다. 확인 뒤 관리자 화면이 POST /api/admin/purge-original을 부르면
-- 서버(service role)가 그 행의 bucket·file_path 객체를 지우고 file_path를 null로 바꾼다.
create or replace function public.review_document(
  p_doc_id uuid,
  p_decision text,
  p_valid_until date default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.verification_documents%rowtype;
  v_has_expiry boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception '관리자만 서류를 확인할 수 있어요' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('verified', 'rejected') then
    raise exception '처리 결과는 verified 또는 rejected여야 해요' using errcode = '22023';
  end if;

  select * into v_doc from public.verification_documents where id = p_doc_id for update;
  if not found then
    raise exception '서류를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'submitted' then
    raise exception '이미 처리된 서류예요' using errcode = '22023';
  end if;

  v_has_expiry := v_doc.doc_type in
    ('instructor_cert', 'liability_insurance', 'first_aid', 'rep_instructor_cert');

  if p_decision = 'verified' then
    if v_has_expiry and p_valid_until is null then
      raise exception '유효기간을 입력해 주세요' using errcode = '22023';
    end if;

    update public.verification_documents set
      status = 'verified',
      valid_until = case when v_has_expiry then p_valid_until else null end,
      reject_reason = null,
      reviewed_by = auth.uid(),
      verified_at = now()
    where id = p_doc_id;
  else
    if v_reason is null then
      raise exception '반려 사유를 입력해 주세요' using errcode = '22023';
    end if;

    update public.verification_documents set
      status = 'rejected',
      reject_reason = v_reason,
      reviewed_by = auth.uid(),
      verified_at = null
    where id = p_doc_id;
  end if;

  insert into public.admin_actions (admin_id, target_user_id, action, reason)
  values (
    auth.uid(),
    v_doc.owner_id,
    case when p_decision = 'verified' then 'document_verified' else 'document_rejected' end,
    concat_ws(' · ', v_doc.doc_type, v_reason)
  );
end;
$$;

revoke execute on function public.review_document(uuid, text, date, text) from public, anon;
grant execute on function public.review_document(uuid, text, date, text) to authenticated;

-- can_view_profile (005 정의 기준)
create or replace function public.can_view_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    target = auth.uid()
    or public.is_admin()
    or (
      public.is_active()
      and (
        -- 센터 이름은 로그인한 모두에게
        exists (
          select 1 from public.profiles t
          where t.id = target and 'center' = any(t.roles)
        )
        -- 센터는 공개 프로필 강사의 이름을 본다(talent_profiles 조회 정책과 같은 조건)
        or (
          exists (
            select 1 from public.profiles v
            where v.id = auth.uid() and 'center' = any(v.roles)
          )
          and exists (
            select 1 from public.talent_profiles ip
            where ip.user_id = target and ip.is_public
          )
        )
        -- 센터는 자기 공고에 지원한 강사의 이름을 본다(공개를 꺼도)
        or public.applied_to_my_jobs(target)
      )
    ),
    false
  );
$$;

revoke execute on function public.can_view_profile(uuid) from public, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;

-- paid_mode (005 정의 기준)
create or replace function public.paid_mode()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.value = 'true'::jsonb from public.aqua_settings s where s.key = 'paid_mode'), false);
$$;

revoke execute on function public.paid_mode() from public, anon;
grant execute on function public.paid_mode() to authenticated;

-- get_public_facts (005 정의 기준). 파일 경로·버킷·번호·반려 사유는 절대 내보내지 않는다.
create or replace function public.get_public_facts(p_user uuid)
returns table (doc_type text, valid_until date, verified_at timestamptz, org text, grade text)
language sql
stable
security definer
set search_path = public
as $$
  select e.doc_type, e.valid_until, e.verified_at,
         nullif(btrim(e.meta ->> 'org'), ''), nullif(btrim(e.meta ->> 'grade'), '')
  from (
    select distinct d.doc_type
    from public.verification_documents d
    where d.owner_id = p_user and d.status = 'verified'
  ) t
  cross join lateral public.effective_doc(p_user, t.doc_type) e
  join public.profiles tp on tp.id = p_user
  where e.id is not null
    -- 정지·퇴출 계정의 사실은 숨긴다(본인·관리자는 본다)
    and (tp.account_status = 'active' or p_user = auth.uid() or public.is_admin())
    and (
      -- 센터 서류 사실: 대상이 센터 역할이면 누구나
      ('center' = any(tp.roles)
       and e.doc_type in ('business_registration', 'travel_business', 'representative_id', 'rep_instructor_cert'))
      -- 그 밖(강사 서류 등): 대상의 이름을 볼 수 있는 로그인 사용자만
      or (auth.uid() is not null and public.can_view_profile(p_user))
    )
  order by e.doc_type;
$$;

revoke execute on function public.get_public_facts(uuid) from public;
grant execute on function public.get_public_facts(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. centers: 센터(테넌트) 자리. 지금은 센터 역할 계정마다 한 행(kind 'listing').
--    핀프렌즈와 합칠 때 WD centers에 kind로 합치고, owner_user_id는 center_members의 owner로 옮긴다.
--    누구나 id·name·kind만 읽는다(공개 시장). 쓰기는 아래 트리거(SECURITY DEFINER)만.
-- ---------------------------------------------------------------------

create table if not exists public.centers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.profiles(id) on delete cascade,
  name text,
  kind text not null default 'listing' check (kind in ('listing', 'managed')),
  created_at timestamptz not null default now()
);

alter table public.centers enable row level security;

drop policy if exists centers_select_all on public.centers;
create policy centers_select_all on public.centers
  for select to anon, authenticated using (true);

-- 칸 권한: id·name·kind·created_at만 읽기. 쓰기 권한 없음.
revoke all on table public.centers from anon, authenticated;
grant select (id, name, kind, created_at) on public.centers to anon, authenticated;

-- 센터 역할이 생기면(가입·역할 변경) centers 행을 만든다. 역할이 빠져도 행은 남긴다(공고가 가리킨다).
-- roles는 sync_profile_roles(BEFORE)가 바꿀 수 있어 컬럼 지정 대신 WHEN으로 최종 값을 본다.
create or replace function public.ensure_center_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.centers (owner_user_id, name)
  values (
    new.id,
    coalesce(
      (select nullif(btrim(cp.center_name), '') from public.center_profiles cp where cp.user_id = new.id),
      new.display_name
    )
  )
  on conflict (owner_user_id) do nothing;
  return null;
end;
$$;

revoke execute on function public.ensure_center_for_profile() from public, anon, authenticated;

drop trigger if exists profiles_ensure_center on public.profiles;
create trigger profiles_ensure_center after insert or update on public.profiles
  for each row when ('center' = any(new.roles))
  execute function public.ensure_center_for_profile();

-- center_profiles.center_id: 항상 주인의 centers.id로 맞춘다(사용자가 다른 센터를 가리키게 못 한다).
-- center_name이 바뀌면 centers.name도 맞춘다(비우면 회원 이름).
alter table public.center_profiles
  add column if not exists center_id uuid references public.centers(id) on delete set null;

-- BEFORE: centers 행을 (없으면) 만들고 center_id를 채운다. 이름 맞추기는 AFTER에서 한다
-- (앱은 upsert를 쓴다. 충돌로 insert가 update로 바뀌면 BEFORE INSERT의 값은 실제로 저장되지 않으므로).
create or replace function public.center_profiles_link_center()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_center uuid;
begin
  select c.id into v_center from public.centers c where c.owner_user_id = new.user_id;
  if v_center is null then
    insert into public.centers (owner_user_id, name)
    values (
      new.user_id,
      coalesce(
        nullif(btrim(new.center_name), ''),
        (select p.display_name from public.profiles p where p.id = new.user_id)
      )
    )
    returning id into v_center;
  end if;

  new.center_id := v_center;
  return new;
end;
$$;

revoke execute on function public.center_profiles_link_center() from public, anon, authenticated;

-- AFTER: 실제로 저장된 center_name으로 centers.name을 맞춘다(비우면 회원 이름)
create or replace function public.center_profiles_sync_center_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.center_name), ''),
    (select p.display_name from public.profiles p where p.id = new.user_id)
  );
  update public.centers set name = v_name
  where id = new.center_id and name is distinct from v_name;
  return null;
end;
$$;

revoke execute on function public.center_profiles_sync_center_name() from public, anon, authenticated;

-- 백필: 센터 역할 계정 + (혹시 역할이 빠진) 공고 주인 → centers
insert into public.centers (owner_user_id, name)
select p.id, coalesce(nullif(btrim(cp.center_name), ''), p.display_name)
from public.profiles p
left join public.center_profiles cp on cp.user_id = p.id
where 'center' = any(p.roles)
   or exists (select 1 from public.job_posts j where j.owner_id = p.id)
on conflict (owner_user_id) do nothing;

update public.center_profiles cp set center_id = c.id
from public.centers c
where c.owner_user_id = cp.user_id and cp.center_id is distinct from c.id;

drop trigger if exists center_profiles_link_center on public.center_profiles;
create trigger center_profiles_link_center before insert or update on public.center_profiles
  for each row execute function public.center_profiles_link_center();

drop trigger if exists center_profiles_sync_center_name on public.center_profiles;
create trigger center_profiles_sync_center_name after insert or update of center_name on public.center_profiles
  for each row execute function public.center_profiles_sync_center_name();

-- job_posts.center_id: 005에서 만든 빈 칸을 채우고 NOT NULL + 외래 키
update public.job_posts j set center_id = c.id
from public.centers c
where c.owner_user_id = j.owner_id and j.center_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.job_posts'::regclass and conname = 'job_posts_center_id_fkey'
  ) then
    alter table public.job_posts add constraint job_posts_center_id_fkey
      foreign key (center_id) references public.centers(id) on delete cascade;
  end if;
end $$;

alter table public.job_posts alter column center_id set not null;

create index if not exists job_posts_center_idx on public.job_posts (center_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. 구독 권한 자리 (결제는 나중에)
--    센터는 월 구독 'aquajob'으로 공고 등록·제안, 강사(프리랜서)는 월 구독 'aquajob_talent'로
--    공고 상세·지원. 'center_app'(센터앱)은 자리만. 따로 팔거나 묶어서 판다(Adobe처럼).
--    무료 기간(paid_mode=false): 모두 true. 유료 전환 후: 결제 표가 생기기 전까지 운영자(관리자) 계정만 true.
--    남의 권한은 물을 수 없다(본인·자기 센터·관리자·서버 세션만). 모르는 상품 이름은 false.
-- ---------------------------------------------------------------------

create or replace function public.user_has_product(p_user uuid, p_product text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user is null or p_product is null
     or p_product not in ('aquajob', 'aquajob_talent', 'center_app') then
    return false;
  end if;
  if auth.uid() is not null and p_user is distinct from auth.uid() and not public.is_admin() then
    return false;
  end if;
  if not public.paid_mode() then
    return true;
  end if;
  -- 결제 표(구독)가 생기면 여기서 확인한다. 지금은 운영자 계정만.
  return exists (
    select 1 from public.profiles p
    where p.id = p_user and 'admin' = any(p.roles) and p.account_status = 'active'
  );
end;
$$;

revoke execute on function public.user_has_product(uuid, text) from public, anon;
grant execute on function public.user_has_product(uuid, text) to authenticated;

create or replace function public.center_has_product(p_center_id uuid, p_product text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if p_center_id is null or p_product is null
     or p_product not in ('aquajob', 'aquajob_talent', 'center_app') then
    return false;
  end if;
  select c.owner_user_id into v_owner from public.centers c where c.id = p_center_id;
  if not found then
    return false;
  end if;
  if auth.uid() is not null and v_owner is distinct from auth.uid() and not public.is_admin() then
    return false;
  end if;
  if not public.paid_mode() then
    return true;
  end if;
  -- 결제 표(센터 구독)가 생기면 여기서 확인한다. 지금은 운영자 계정의 센터만.
  return exists (
    select 1 from public.profiles p
    where p.id = v_owner and 'admin' = any(p.roles) and p.account_status = 'active'
  );
end;
$$;

revoke execute on function public.center_has_product(uuid, text) from public, anon;
grant execute on function public.center_has_product(uuid, text) to authenticated;

-- 공고 상세(설명·센터 상세)를 볼 수 있는가 (005 정의 기준, paid_mode 분기를 구독 자리로 바꿈).
-- 로그인 + 활성 + (관리자 · 그 공고의 주인 · 강사 구독(aquajob_talent) · 자기 센터 구독(aquajob)).
-- 무료 기간에는 구독 함수가 true라 로그인한 모든 회원이 본다(005와 같다).
create or replace function public.can_view_job_detail(p_job uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and public.is_active()
    and (
      public.is_admin()
      or exists (select 1 from public.job_posts j where j.id = p_job and j.owner_id = auth.uid())
      or (
        exists (select 1 from public.profiles v where v.id = auth.uid() and 'instructor' = any(v.roles))
        and public.user_has_product(auth.uid(), 'aquajob_talent')
      )
      or exists (
        select 1
        from public.centers c
        join public.profiles v on v.id = c.owner_user_id
        where c.owner_user_id = auth.uid()
          and 'center' = any(v.roles)
          and public.center_has_product(c.id, 'aquajob')
      )
    ),
    false
  );
$$;

revoke execute on function public.can_view_job_detail(uuid) from public, anon;
grant execute on function public.can_view_job_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. 공고 RPC: center_id를 채우고 내보낸다. 반환 칸이 바뀌는 함수는 drop → create
--    (함수 본문은 서로를 이름으로 부르므로 drop 순서는 상관없다)
-- ---------------------------------------------------------------------

drop function if exists public.list_center_job_history(uuid);
drop function if exists public.get_center_public_profile(uuid);
drop function if exists public.get_job_detail(uuid);
drop function if exists public.get_job_summary(uuid);
drop function if exists public.list_public_jobs(text, text, boolean, int, int);
drop function if exists public.job_summary_rows(uuid, uuid, boolean);

-- 요약 행 (005 정의 기준 + center_id, 두 번째 인자는 주인 id 대신 센터 id)
create function public.job_summary_rows(p_job uuid, p_center_id uuid, p_public boolean)
returns table (
  id uuid,
  owner_id uuid,
  center_id uuid,
  center_name text,
  job_type text,
  title text,
  region text,
  venue text,
  class_date date,
  start_time time,
  end_time time,
  work_days text[],
  work_time text,
  tour_start date,
  tour_end date,
  destination text,
  destination_kind text,
  covers_flight boolean,
  covers_lodging boolean,
  pay_amount int,
  pay_unit text,
  headcount int,
  remaining int,
  requirement_tags text[],
  deadline date,
  view_count int,
  created_at timestamptz,
  edited_at timestamptz,
  effective_status text
)
language sql
stable
set search_path = public
as $$
  select
    j.id, j.owner_id, j.center_id,
    coalesce(nullif(btrim(cp.center_name), ''), p.display_name),
    j.job_type, j.title, j.region, j.venue,
    j.class_date, j.start_time, j.end_time,
    j.work_days, j.work_time,
    j.tour_start, j.tour_end, j.destination, j.destination_kind, j.covers_flight, j.covers_lodging,
    j.pay_amount, j.pay_unit, j.headcount,
    greatest(j.headcount - (
      select count(*) from public.job_applications a
      where a.job_id = j.id and a.status = 'selected'
    )::int, 0),
    j.requirement_tags, j.deadline, j.view_count, j.created_at, j.edited_at,
    public.job_effective_status(j)
  from public.job_posts j
  join public.profiles p on p.id = j.owner_id
  left join public.center_profiles cp on cp.user_id = j.owner_id
  where (p_job is null or j.id = p_job)
    and (p_center_id is null or j.center_id = p_center_id)
    and (not p_public or (j.status <> 'hidden' and p.account_status = 'active'));
$$;

revoke execute on function public.job_summary_rows(uuid, uuid, boolean) from public, anon, authenticated;

-- 공고 목록 (005 정의 기준 + center_id)
create function public.list_public_jobs(
  p_type text default null,
  p_region text default null,
  p_paid_only boolean default false,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid, owner_id uuid, center_id uuid, center_name text, job_type text, title text, region text, venue text,
  class_date date, start_time time, end_time time, work_days text[], work_time text,
  tour_start date, tour_end date, destination text, destination_kind text,
  covers_flight boolean, covers_lodging boolean, pay_amount int, pay_unit text,
  headcount int, remaining int, requirement_tags text[], deadline date, view_count int,
  created_at timestamptz, edited_at timestamptz, effective_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.job_summary_rows(null, null, true) s
  where (p_type is null or s.job_type = p_type)
    and (p_region is null or s.region = p_region)
    and (not coalesce(p_paid_only, false) or s.pay_amount is not null)
  order by (s.effective_status = 'open') desc, s.created_at desc, s.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.list_public_jobs(text, text, boolean, int, int) from public;
grant execute on function public.list_public_jobs(text, text, boolean, int, int) to anon, authenticated;

-- 공고 요약 1건 (005 정의 기준 + center_id)
create function public.get_job_summary(p_job uuid)
returns table (
  id uuid, owner_id uuid, center_id uuid, center_name text, job_type text, title text, region text, venue text,
  class_date date, start_time time, end_time time, work_days text[], work_time text,
  tour_start date, tour_end date, destination text, destination_kind text,
  covers_flight boolean, covers_lodging boolean, pay_amount int, pay_unit text,
  headcount int, remaining int, requirement_tags text[], deadline date, view_count int,
  created_at timestamptz, edited_at timestamptz, effective_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.* from public.job_summary_rows(p_job, null, true) s where p_job is not null;
$$;

revoke execute on function public.get_job_summary(uuid) from public;
grant execute on function public.get_job_summary(uuid) to anon, authenticated;

-- 센터 공개 프로필 (005 정의 기준). 이제 centers.id로 찾는다. 반환: 005 칸 + center_id(맨 앞).
-- 센터명·주 교육 장소·교육 요일·시간대·사진은 누구나.
-- 대표자·대표강사·소속강사·월 교육생·주소는 로그인 + (센터 주인 본인 또는 can_view_job_detail())일 때만.
create function public.get_center_public_profile(p_center_id uuid)
returns table (
  center_id uuid,
  user_id uuid,
  center_name text,
  venues text[],
  teaching_days text[],
  teaching_time text,
  photo_paths text[],
  detail_visible boolean,
  representative_name text,
  head_instructor text,
  instructor_count int,
  instructor_names text[],
  monthly_students int,
  address text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    p.id,
    coalesce(nullif(btrim(cp.center_name), ''), p.display_name),
    coalesce(cp.venues, '{}'),
    coalesce(cp.teaching_days, '{}'),
    cp.teaching_time,
    coalesce(cp.photo_paths, '{}'),
    v.ok,
    case when v.ok then cp.representative_name end,
    case when v.ok then cp.head_instructor end,
    case when v.ok then cp.instructor_count end,
    case when v.ok then cp.instructor_names end,
    case when v.ok then cp.monthly_students end,
    case when v.ok then cp.address end
  from public.centers c
  join public.profiles p on p.id = c.owner_user_id
  left join public.center_profiles cp on cp.user_id = p.id
  cross join lateral (
    select (auth.uid() is not null and (c.owner_user_id = auth.uid() or public.can_view_job_detail())) as ok
  ) v
  where c.id = p_center_id
    and 'center' = any(p.roles)
    and (p.account_status = 'active' or p.id = auth.uid() or public.is_admin());
$$;

revoke execute on function public.get_center_public_profile(uuid) from public;
grant execute on function public.get_center_public_profile(uuid) to anon, authenticated;

-- 센터 공고 이력 (005 정의 기준). centers.id로 찾는다. 반환: 005 칸 + center_id.
create function public.list_center_job_history(p_center_id uuid)
returns table (
  id uuid, center_id uuid, title text, job_type text, pay_amount int, pay_unit text,
  created_at timestamptz, effective_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.center_id, s.title, s.job_type, s.pay_amount, s.pay_unit, s.created_at, s.effective_status
  from public.job_summary_rows(null, p_center_id, true) s
  where p_center_id is not null
  order by s.created_at desc, s.id
  limit 50;
$$;

revoke execute on function public.list_center_job_history(uuid) from public;
grant execute on function public.list_center_job_history(uuid) to anon, authenticated;

-- 공고 상세 (005 정의 기준 + center_id). 로그인 + can_view_job_detail 필요.
create function public.get_job_detail(p_job uuid)
returns table (
  id uuid, owner_id uuid, center_id uuid, center_name text, job_type text, title text, region text, venue text,
  class_date date, start_time time, end_time time, work_days text[], work_time text,
  tour_start date, tour_end date, destination text, destination_kind text,
  covers_flight boolean, covers_lodging boolean, pay_amount int, pay_unit text,
  headcount int, remaining int, requirement_tags text[], deadline date, view_count int,
  created_at timestamptz, edited_at timestamptz, effective_status text,
  description text,
  center jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = '42501';
  end if;
  if not public.can_view_job_detail(p_job) then
    raise exception '상세 내용을 볼 수 없어요' using errcode = '42501';
  end if;

  v_public := not (
    public.is_admin()
    or exists (select 1 from public.job_posts x where x.id = p_job and x.owner_id = v_uid)
  );

  return query
  select s.*,
         j.description,
         jsonb_build_object(
           'center_name', s.center_name,
           'representative_name', cp.representative_name,
           'head_instructor', cp.head_instructor,
           'instructor_count', cp.instructor_count,
           'instructor_names', coalesce(cp.instructor_names, '{}'),
           'monthly_students', cp.monthly_students,
           'teaching_days', coalesce(cp.teaching_days, '{}'),
           'teaching_time', cp.teaching_time,
           'venues', coalesce(cp.venues, '{}'),
           'address', cp.address,
           'photo_paths', coalesce(cp.photo_paths, '{}')
         )
  from public.job_summary_rows(p_job, null, v_public) s
  join public.job_posts j on j.id = s.id
  left join public.center_profiles cp on cp.user_id = s.owner_id
  where p_job is not null;
end;
$$;

revoke execute on function public.get_job_detail(uuid) from public, anon;
grant execute on function public.get_job_detail(uuid) to authenticated;

-- 공고 등록 (005 정의 기준): 활성 센터 + 센터 구독('aquajob') + verification_requirements('post_'||종류)의
-- 서류가 유효해야 한다. job_posts.center_id = 호출자의 centers.id
create or replace function public.create_job_post(payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_type text := payload ->> 'job_type';
  v_center uuid;
  r public.job_posts;
  v_id uuid;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 공고를 올릴 수 있어요' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and 'center' = any(p.roles)) then
    raise exception '센터 계정만 공고를 올릴 수 있어요' using errcode = '42501';
  end if;
  select c.id into v_center from public.centers c where c.owner_user_id = v_uid;
  if v_center is null then
    raise exception '센터 정보를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if not public.center_has_product(v_center, 'aquajob') then
    raise exception '공고를 올리려면 아쿠아잡 센터 구독이 필요해요' using errcode = '42501';
  end if;
  if v_type is null or v_type not in ('lesson', 'affiliation', 'tour') then
    raise exception '공고 종류가 올바르지 않아요' using errcode = '22023';
  end if;
  if not public.has_requirements(v_uid, 'post_' || v_type) then
    raise exception '이 종류의 공고를 올리는 데 필요한 서류가 아직 확인되지 않았어요' using errcode = '42501';
  end if;

  r := public.job_post_from_payload(payload, v_type);

  insert into public.job_posts (
    owner_id, center_id, job_type, title, region, venue,
    class_date, start_time, end_time, work_days, work_time,
    tour_start, tour_end, destination, destination_kind, covers_flight, covers_lodging,
    pay_amount, pay_unit, headcount, requirement_tags, description, deadline
  ) values (
    v_uid, v_center, r.job_type, r.title, r.region, r.venue,
    r.class_date, r.start_time, r.end_time, r.work_days, r.work_time,
    r.tour_start, r.tour_end, r.destination, r.destination_kind, r.covers_flight, r.covers_lodging,
    r.pay_amount, r.pay_unit, r.headcount, r.requirement_tags, r.description, r.deadline
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_job_post(jsonb) from public, anon;
grant execute on function public.create_job_post(jsonb) to authenticated;

-- 지원 (005 정의 기준): 활성 강사 + 강사 구독('aquajob_talent') + 상세 열람 가능 + 모집 중 + 본인 공고 아님.
create or replace function public.apply_to_job(p_job uuid, p_message text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.job_posts;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_app public.job_applications;
  v_id uuid;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 지원할 수 있어요' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and 'instructor' = any(p.roles)) then
    raise exception '강사 계정만 지원할 수 있어요' using errcode = '42501';
  end if;
  if not public.user_has_product(v_uid, 'aquajob_talent') then
    raise exception '지원하려면 아쿠아잡 강사 구독이 필요해요' using errcode = '42501';
  end if;
  if not public.can_view_job_detail(p_job) then
    raise exception '공고 상세를 볼 수 있어야 지원할 수 있어요' using errcode = '42501';
  end if;
  if v_msg is not null and char_length(v_msg) > 200 then
    raise exception '한마디는 200자까지 쓸 수 있어요' using errcode = '22023';
  end if;

  -- 선택·마감과 겹치지 않게 공고 행을 잠근다(공유 잠금: 지원끼리는 서로 막지 않는다)
  select j.* into v_job
  from public.job_posts j
  join public.profiles o on o.id = j.owner_id
  where j.id = p_job and o.account_status = 'active'
  for share of j;
  if not found or v_job.status = 'hidden' then
    raise exception '공고를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_job.owner_id = v_uid then
    raise exception '내 공고에는 지원할 수 없어요' using errcode = '42501';
  end if;
  if public.job_effective_status(v_job) <> 'open' then
    raise exception '모집이 끝난 공고예요' using errcode = '22023';
  end if;

  select * into v_app from public.job_applications
  where job_id = p_job and instructor_id = v_uid
  for update;

  if found then
    if v_app.status <> 'withdrawn' then
      raise exception '이미 지원한 공고예요' using errcode = '23505';
    end if;
    update public.job_applications
      set status = 'applied', message = v_msg, decided_at = null
    where id = v_app.id;
    return v_app.id;
  end if;

  insert into public.job_applications (job_id, instructor_id, message)
  values (p_job, v_uid, v_msg)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.apply_to_job(uuid, text) from public, anon;
grant execute on function public.apply_to_job(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. PostgREST 스키마 다시 읽기(이름이 바뀐 테이블·함수를 API가 바로 보도록)
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
