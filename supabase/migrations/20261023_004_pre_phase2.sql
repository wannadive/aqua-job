-- =====================================================================
-- 아쿠아잡 2단계 전 정비: 회원 이름 노출 축소 + "유효 서류" 규칙 하나로
-- 001 → 002 → 003을 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(create or replace, drop policy if exists → create policy).
--
-- 1) effective_doc(사용자, 서류 종류): 그 종류의 확인된(verified) 서류 중 가장 최근 확인 건이고
--    유효기간이 없거나 오늘(KST) 이상인 것. 가장 최근 확인 건이 만료됐으면 없음(null).
--    "남에게 보이는 사실"과 "요건 충족"은 모두 이 규칙 하나로 본다.
--    (TS lib/verification/effective.ts의 effectiveDoc과 같은 규칙이다)
--    본인 화면은 지금처럼 최신 제출 건(latestByType)으로 진행 상태를 보여 준다.
-- 2) has_requirements: 001 정의를 바탕으로, 서류 판정만 effective_doc로 바꾼다.
-- 3) profiles 조회: 로그인한 누구나 → can_view_profile(대상)이 참일 때만.
--    본인, 관리자, 대상이 센터 역할(센터 이름은 모두에게), 보는 사람이 센터이고 대상 강사가 공개 프로필.
--    (공고에 지원한 강사를 그 센터가 보는 조건은 2단계 지원 기능(005)에서 이 함수를 다시 정의해 더한다)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. effective_doc
--    SECURITY INVOKER: 직접 부르면 documents RLS(본인·관리자)가 그대로 적용된다.
--    남의 서류 행(meta·file_path)이 이 함수로 새지 않게 하려는 것이다.
--    has_requirements 같은 SECURITY DEFINER 함수 안에서는 소유자 권한으로 돈다.
--    반환은 행 하나 또는 null. 호출하는 쪽은 (effective_doc(…)).id is null 로 "없음"을 판정한다
--    (복합 값의 is not null은 모든 칸이 null이 아니어야 참이라 쓰지 않는다).
-- ---------------------------------------------------------------------

create or replace function public.effective_doc(p_user uuid, p_doc_type text)
returns public.documents
language sql
stable
set search_path = public
as $$
  select x.*
  from (
    select d.*
    from public.documents d
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

-- ---------------------------------------------------------------------
-- 2. has_requirements: requirement_rules의 모든 서류에 유효 서류(effective_doc)가 있으면 true.
--    규칙이 없는 행동은 true. 본인 것만 물어볼 수 있다(관리자는 누구든). (001 정의 기준, 002·003은 바꾸지 않았다)
-- ---------------------------------------------------------------------

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
    from public.requirement_rules r
    where r.action = p_action
      and (public.effective_doc(p_user, r.doc_type)).id is null
  );
end;
$$;

revoke execute on function public.has_requirements(uuid, text) from public, anon;
grant execute on function public.has_requirements(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. can_view_profile: 이 사용자가 대상의 profiles 행(이름 등)을 볼 수 있는가
--    SECURITY DEFINER라 안에서 profiles·instructor_profiles를 읽어도 RLS가 다시 돌지 않는다(재귀 없음).
--    역할 확인은 003처럼 roles로 한다.
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
    -- 센터 이름은 로그인한 모두에게
    or exists (
      select 1 from public.profiles t
      where t.id = target and 'center' = any(t.roles)
    )
    -- 센터는 공개 프로필 강사의 이름을 본다(instructor_profiles 조회 정책과 같은 조건)
    or (
      exists (
        select 1 from public.profiles v
        where v.id = auth.uid() and 'center' = any(v.roles)
      )
      and exists (
        select 1 from public.instructor_profiles ip
        where ip.user_id = target and ip.is_public
      )
    ),
    false
  );
$$;

revoke execute on function public.can_view_profile(uuid) from public, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;

-- profiles 조회: 001의 "로그인 사용자 누구나"를 지우고 can_view_profile로 좁힌다.
-- 수정 정책(profiles_update_own, 002)은 그대로 둔다.
drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_select_visible on public.profiles;
create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (public.can_view_profile(id));
