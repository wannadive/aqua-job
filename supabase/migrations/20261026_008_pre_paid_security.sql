-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)의 SQL Editor에서 실행 — 워너다이브 프로젝트에서 실행하지 말 것
-- =====================================================================
-- 아쿠아잡 008: 유료 전환 전 보안 정리 (2단계에서 미뤄 둔 항목)
-- 001 → 002 → 003 → 004 → 005 → 006 → 007을 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(drop policy if exists → create policy, create or replace —
-- 반환 칸·인자가 그대로인 함수만 바꾼다).
-- 재정의한 것은 모두 최신 정의를 복사해 고쳤다:
--   can_view_profile(006) · get_public_facts(006) · talent_profiles_select(007)
--   · job_applications_select(007) · job_posts_select_owner_or_admin(005)
--
-- 규칙: "강사 정보"와 "센터 이름"을 나눈다
--   강사 정보(talent_profiles 이력서 · 강사 서류 사실 · 강사 이름)는 새 함수 job_can_view_talent(대상) 하나로 판정한다.
--     참 = 본인 · 관리자 · (보는 사람이 활성 + 구독 센터(job_center_entitled())
--          × (대상의 이력서가 공개 또는 대상이 내 공고에 지원(취소 제외)))
--     대상이 센터 역할을 같이 가졌다는 것(겸용 계정)은 이 판정에 들어가지 않는다.
--   센터 이름: can_view_profile의 "대상이 센터 역할" 분기는 활성 센터의 profiles 행(이름·역할 등 계정 기본 칸)만 연다
--     (정지·퇴출 센터의 행은 본인·관리자만).
--     profiles 행은 한 행이라 칸별로 나눌 수 없으므로 행은 그대로 보이지만, 이 분기로는
--     이력서·강사 서류 사실 같은 강사 정보가 더는 열리지 않는다(아래 2·3).
--
-- 1) job_can_view_talent(p_user) 새로 — 위 강사 정보 규칙.
-- 2) can_view_profile(006 기준): 강사 쪽 분기(공개 이력서 강사 · 내 공고 지원자)를 job_can_view_talent로 바꾼다.
--    → 센터가 강사 이름을 보려면 센터 구독이 필요하다(무료 기간엔 지금과 같다).
--    센터 이름 분기는 대상 센터가 활성일 때만(정지·퇴출 센터 이름은 본인·관리자만).
-- 3) get_public_facts(006 기준):
--    센터 서류 사실(사업자등록증·여행업·대표자 신분증·대표 강사 자격증) — 대상이 센터 역할이고 활성이면 누구나
--      (get_center_public_facts(007)가 이 분기를 쓴다 — 동작 그대로).
--    그 밖의 서류 사실(강사 서류) — 로그인 + job_can_view_talent(대상).
--      = 예전 "can_view_profile(대상)"에서 '대상이 센터 역할' 분기를 빼고, 보는 사람이 센터면 구독을 더한 것.
--      겸용(센터+강사) 계정의 강사 서류 사실은 이제 강사 규칙을 따른다(강사·다른 일반 회원에게 안 나간다).
-- 4) talent_profiles 조회(007 기준): 같은 규칙을 job_can_view_talent 하나로 쓴다(동작은 007과 같다).
-- 5) job_applications 조회(007 기준): 공고 주인 분기에 센터 구독(job_center_entitled()) 추가.
--    지원한 강사 본인 분기·관리자 분기는 그대로.
-- 6) job_posts 조회(005 기준): 주인 분기에 is_active() 추가(정지·퇴출 센터는 직접 조회로 자기 공고도 못 읽는다).
--    관리자 분기는 그대로. 공개 RPC(목록·요약·상세)는 SECURITY DEFINER라 영향 없다.
-- 무료 기간(paid_mode=false)에는 center_has_product가 true라 활성 센터의 동작은 지금과 같다. 관리자는 영향 없음.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 강사 정보 판정 (새로)
--    SECURITY DEFINER라 정책 안에서 불러도 talent_profiles·job_applications RLS를 다시 돌지 않는다(재귀 없음).
--    job_center_entitled()는 보는 사람이 활성 + 센터 역할 + 자기 센터 'aquajob'일 때만 참이다(007).
-- ---------------------------------------------------------------------
create or replace function public.job_can_view_talent(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_user = auth.uid()
    or public.is_admin()
    or (
      public.is_active()
      and public.job_center_entitled()
      and (
        -- 공개 이력서 강사
        exists (
          select 1 from public.talent_profiles tp
          where tp.user_id = p_user and tp.is_public
        )
        -- 내 공고에 지원한 강사(지원 취소 제외, 공개를 꺼도)
        or public.applied_to_my_jobs(p_user)
      )
    ),
    false
  );
$$;

revoke execute on function public.job_can_view_talent(uuid) from public, anon;
grant execute on function public.job_can_view_talent(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. can_view_profile (006 정의 기준): profiles 행(이름)을 볼 수 있는가
--    센터 이름 분기는 그대로, 강사 쪽 분기는 job_can_view_talent로.
-- ---------------------------------------------------------------------
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
        -- 활성 센터의 이름은 로그인한 모두에게. profiles 행(이름)만 연다 — 강사 정보(이력서·강사 서류 사실)는
        -- 이 분기로 열리지 않는다(job_can_view_talent가 따로 판정). 정지·퇴출 센터는 공개 신원이 없다
        -- (get_center_public_profile과 같다) — 본인·관리자만 본다.
        exists (
          select 1 from public.profiles t
          where t.id = target and 'center' = any(t.roles) and t.account_status = 'active'
        )
        -- 강사 이름: 강사 정보 규칙과 같다(구독 센터 × (공개 이력서 또는 내 공고 지원자))
        or public.job_can_view_talent(target)
      )
    ),
    false
  );
$$;

revoke execute on function public.can_view_profile(uuid) from public, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. get_public_facts (006 정의 기준). 파일 경로·버킷·번호·반려 사유는 절대 내보내지 않는다.
-- ---------------------------------------------------------------------
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
      -- 센터 서류 사실: 대상이 센터 역할이면 누구나(비로그인 포함)
      ('center' = any(tp.roles)
       and e.doc_type in ('business_registration', 'travel_business', 'representative_id', 'rep_instructor_cert'))
      -- 그 밖(강사 서류 등): 로그인 + 강사 정보 규칙(본인·관리자·구독 센터 × 공개 이력서/지원자).
      -- 대상이 센터 역할을 같이 가졌다는 것만으로는 열리지 않는다.
      or (auth.uid() is not null and public.job_can_view_talent(p_user))
    )
  order by e.doc_type;
$$;

revoke execute on function public.get_public_facts(uuid) from public;
grant execute on function public.get_public_facts(uuid) to anon, authenticated;

-- get_center_public_facts(007)는 그대로 둔다: get_public_facts의 센터 서류 분기만 쓴다.

-- ---------------------------------------------------------------------
-- 4. 조회 정책
-- ---------------------------------------------------------------------

-- talent_profiles 조회 (007 정의 기준): 본인 · 관리자 · (활성 + 구독 센터) × (공개 이력서 또는 내 공고 지원자)
-- = job_can_view_talent(user_id). 판정을 한 곳에 둔다(007과 동작 같음).
-- 행과 상관없는 부분(본인·관리자·활성·구독)은 (select …)로 한 번만 계산하고, 행마다 도는 것은
-- job_can_view_talent(user_id)뿐이다(그 안의 같은 조건은 이미 참이라 결과가 같다).
drop policy if exists talent_profiles_select on public.talent_profiles;
create policy talent_profiles_select on public.talent_profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (
      (select public.is_active())
      and (select public.job_center_entitled())
      and public.job_can_view_talent(user_id)
    )
  );

-- job_applications 조회 (007 정의 기준)
--   지원한 강사 본인(취소 포함) · 관리자 · 활성 + 구독 공고 주인(취소 제외)
drop policy if exists job_applications_select on public.job_applications;
create policy job_applications_select on public.job_applications
  for select to authenticated
  using (
    instructor_id = (select auth.uid())
    or (select public.is_admin())
    or (
      (select public.is_active())
      and (select public.job_center_entitled())
      and status <> 'withdrawn'
      and exists (
        select 1 from public.job_posts j
        where j.id = job_applications.job_id and j.owner_id = (select auth.uid())
      )
    )
  );

-- job_posts 조회 (005 정의 기준): 활성 주인 · 관리자
drop policy if exists job_posts_select_owner_or_admin on public.job_posts;
create policy job_posts_select_owner_or_admin on public.job_posts
  for select to authenticated
  using (
    (owner_id = (select auth.uid()) and (select public.is_active()))
    or (select public.is_admin())
  );

-- ---------------------------------------------------------------------
-- 5. PostgREST 스키마 다시 읽기
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
