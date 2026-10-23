-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)의 SQL Editor에서 실행 — 워너다이브 프로젝트에서 실행하지 말 것
-- =====================================================================
-- 아쿠아잡 011: 신고 · 관리자 조치(공고 숨김 · 계정 정지/퇴출/다시 활성)
-- 001 → … → 010을 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(create table/index if not exists, add column if not exists,
-- drop constraint/policy if exists → 다시 만들기, create or replace — 반환 칸·인자가 그대로인 함수만 바꾼다).
-- 재정의한 것은 최신 정의를 복사해 고쳤다: aqua_notify(010)
--
-- 위반 사유(정해진 목록 — 신고·관리자 조치가 같이 쓴다. lib 쪽 화면 목록을 만들 때 job_violation_label과 같게):
--   fake_document 가짜 서류 · false_posting 허위 공고 · contact_harvesting 연락처 수집 목적
--   · illegal 불법 행위 · other 기타(설명 필수)
--
-- 규칙
-- 1) job_reports: 신고. 쓰기는 submit_report RPC만(직접 쓰기 권한·정책 없음).
--    조회: 신고한 본인 행 + 관리자(정책). 직접 조회로 읽을 수 있는 칸은
--    id·reporter_id·target_type·target_id·reason·note·status·created_at·resolved_at뿐 —
--    처리 메모(resolution)·처리한 관리자(resolved_by)는 칸 권한이 없다(관리자는 admin_list_reports로 본다).
--    신고당한 사람에게는 알리지 않는다(신고자 보호).
-- 2) submit_report: 활성 회원만. 대상은 신고하는 사람이 볼 수 있는 것만 —
--      job     = 공개 공고(숨김 아님 + 공고 주인 활성)
--      profile = can_view_profile(대상)이 참인 회원
--      center  = centers.id, 주인이 센터 역할 + 활성(관리자는 어떤 센터든)
--    볼 수 없거나 없는 대상은 똑같이 '신고할 대상을 찾을 수 없어요'(P0002 — 있는지 없는지 알려 주지 않는다).
--    내 공고·내 계정·내 센터는 신고할 수 없다. 같은 사람·같은 대상 24시간에 한 번('이미 신고했어요'),
--    한 사람 24시간에 20건까지. 신고하는 사람마다 잠금(advisory lock)을 걸고 센다(동시에 눌러도 한도를 못 넘는다).
-- 3) 관리자 조치 RPC(is_admin()만, 아니면 42501): admin_hide_job · admin_set_account_status · admin_resolve_report
--    · admin_list_reports. 조치마다 admin_actions에 사유(코드)·설명(note)을 남긴다.
--    상태를 바꾸기 직전에 set_config('aqua.action_reason', 사유 문구, true) — 010 알림 트리거가 당사자 알림 본문에
--    '사유: …'로 붙인다. 사유 문구 = 위반 항목 이름, 기타는 '기타 · <설명 80자>'(기타를 고르면 설명이 당사자에게 보인다).
--    그 밖 항목의 설명은 관리자 기록(admin_actions.note)에만 남는다. 함수가 끝나면 설정값을 비운다.
-- 4) admin_hide_job: 공고 → hidden. 남은 '지원함' → '미선택'(지원자에게 '지원한 공고가 마감됐어요' 한 번),
--    '보냄' 제안 → '마감'(받은 강사에게 '받은 제안이 마감됐어요'), 공고 주인에게 '공고가 숨김 처리됐어요 · 사유'.
--    선택한 지원·수락한 제안은 그대로(이미 열린 연락처는 상대방 기록에 남는다 — 설계 §7-1).
--    다시 보이게 하는 기능은 없다(필요하면 SQL로).
-- 5) admin_set_account_status(대상, active|suspended|banned, 사유, 설명):
--    나 자신 · 다른 관리자 계정은 바꿀 수 없다. 정지·퇴출은 위반 사유 필수, 다시 활성(active)은 사유 없이(설명만).
--    suspended(일시 정지): 데이터는 그대로. 공고·이력서는 이미 '주인 활성' 조건으로 공개 경로에서 빠지고,
--      쓰기 RPC는 is_active()에서 막힌다. 다시 활성으로 바꾸면 전부 돌아온다.
--    banned(퇴출): 로그인 차단 상태(앱이 차단 화면) + 모집 중 공고 → hidden, 그 공고의 '지원함' → '미선택',
--      그 공고들의 '보냄' 제안과 그 사람이 받은 '보냄' 제안 → '마감', 그 사람의 '지원함' → '미선택'.
--      퇴출 당사자에게는 계정 알림 하나만 간다(공고 숨김·제안 마감·미선택 알림은 당사자에게는 보내지 않음 —
--      aqua.quiet_user. 상대방(지원자·제안 받은 강사)에게는 평소처럼 간다).
--      다시 활성으로 바꾸면 접근은 돌아오지만 숨긴 공고·마감된 지원·제안은 되돌리지 않는다.
-- 6) admin_resolve_report: 열린 신고만 resolved(조치함) | dismissed(기각)로. 처리 메모 500자까지.
-- 7) admin_list_reports: 신고 + 대상 요약(공고 제목·센터명·공고 상태·대상 계정 상태·같은 대상의 열린 신고 수).
--    연락처·서류 사진·파일 경로는 내보내지 않는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 위반 사유
-- ---------------------------------------------------------------------

-- 위반 사유 이름. 목록 밖이면 null. 내부 전용.
create or replace function public.job_violation_label(p_reason text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_reason
    when 'fake_document' then '가짜 서류'
    when 'false_posting' then '허위 공고'
    when 'contact_harvesting' then '연락처 수집 목적'
    when 'illegal' then '불법 행위'
    when 'other' then '기타'
  end;
$$;

revoke execute on function public.job_violation_label(text) from public, anon, authenticated;

-- 사유·설명 확인 → 다듬은 설명(없으면 null). 사유는 목록 안, 설명 500자까지, 기타는 설명 필수. 내부 전용.
create or replace function public.job_violation_note(p_reason text, p_note text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if public.job_violation_label(p_reason) is null then
    raise exception '사유를 목록에서 골라 주세요' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception '설명은 500자까지 쓸 수 있어요' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception '기타를 고르면 설명을 써 주세요' using errcode = '22023';
  end if;
  return v_note;
end;
$$;

revoke execute on function public.job_violation_note(text, text) from public, anon, authenticated;

-- 당사자 알림에 붙는 사유 문구: 위반 항목 이름, 기타는 '기타 · <설명 80자, 줄바꿈 없이>'. 내부 전용.
create or replace function public.job_violation_notice(p_reason text, p_note text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_reason = 'other' then
      '기타 · ' || left(regexp_replace(btrim(coalesce(p_note, '')), '\s+', ' ', 'g'), 80)
    else public.job_violation_label(p_reason)
  end;
$$;

revoke execute on function public.job_violation_notice(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. 관리자 기록: 설명(note)·대상 공고 칸 추가 (admin_actions는 합칠 때 병합 — 칸만 더한다)
-- ---------------------------------------------------------------------
alter table public.admin_actions add column if not exists note text;
alter table public.admin_actions
  add column if not exists target_job_id uuid references public.job_posts(id) on delete set null;

alter table public.admin_actions drop constraint if exists admin_actions_note_check;
alter table public.admin_actions add constraint admin_actions_note_check
  check (note is null or char_length(note) <= 500);

create index if not exists admin_actions_job_idx
  on public.admin_actions (target_job_id, created_at desc) where target_job_id is not null;

-- ---------------------------------------------------------------------
-- 3. 신고
-- ---------------------------------------------------------------------
create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id uuid not null, -- job: job_posts.id · profile: profiles.id · center: centers.id (대상 종류가 여럿이라 외래 키 없음)
  reason text not null,
  note text null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_by uuid null references public.profiles(id) on delete set null,
  resolved_at timestamptz null,
  resolution text null
);

alter table public.job_reports drop constraint if exists job_reports_target_type_check;
alter table public.job_reports add constraint job_reports_target_type_check
  check (target_type in ('job', 'profile', 'center'));

-- job_violation_label과 같은 목록
alter table public.job_reports drop constraint if exists job_reports_reason_check;
alter table public.job_reports add constraint job_reports_reason_check
  check (reason in ('fake_document', 'false_posting', 'contact_harvesting', 'illegal', 'other'));

alter table public.job_reports drop constraint if exists job_reports_note_check;
alter table public.job_reports add constraint job_reports_note_check
  check ((note is null or char_length(note) <= 500) and (reason <> 'other' or note is not null));

alter table public.job_reports drop constraint if exists job_reports_status_check;
alter table public.job_reports add constraint job_reports_status_check
  check (status in ('open', 'resolved', 'dismissed'));

alter table public.job_reports drop constraint if exists job_reports_resolution_check;
alter table public.job_reports add constraint job_reports_resolution_check
  check (resolution is null or char_length(resolution) <= 500);

create index if not exists job_reports_reporter_created_idx
  on public.job_reports (reporter_id, created_at desc);
create index if not exists job_reports_target_idx
  on public.job_reports (target_type, target_id, created_at desc);
create index if not exists job_reports_status_created_idx
  on public.job_reports (status, created_at desc);

alter table public.job_reports enable row level security;

-- 직접 쓰기 없음. 직접 조회는 정해진 칸만(처리 메모·처리한 관리자 제외).
revoke all on public.job_reports from anon, authenticated;
grant select (id, reporter_id, target_type, target_id, reason, note, status, created_at, resolved_at)
  on public.job_reports to authenticated;

drop policy if exists job_reports_select_own on public.job_reports;
create policy job_reports_select_own on public.job_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

-- 신고 대상의 회원 id(공고 주인 · 회원 · 센터 주인). 없으면 null. 내부 전용.
create or replace function public.job_report_target_user(p_type text, p_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select case p_type
    when 'job' then (select j.owner_id from public.job_posts j where j.id = p_id)
    when 'profile' then (select p.id from public.profiles p where p.id = p_id)
    when 'center' then (select c.owner_user_id from public.centers c where c.id = p_id)
  end;
$$;

revoke execute on function public.job_report_target_user(text, uuid) from public, anon, authenticated;

-- 신고하기. 새 신고 id를 돌려준다.
create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_note text;
  v_owner uuid;
  v_visible boolean := false;
  v_id uuid;
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 신고할 수 있어요' using errcode = '42501';
  end if;
  if p_target_type is null or p_target_type not in ('job', 'profile', 'center') or p_target_id is null then
    raise exception '신고 대상이 올바르지 않아요' using errcode = '22023';
  end if;
  v_note := public.job_violation_note(p_reason, p_note);

  -- 대상이 있고, 신고하는 사람이 볼 수 있는가
  if p_target_type = 'job' then
    select j.owner_id into v_owner
    from public.job_posts j
    join public.profiles o on o.id = j.owner_id
    where j.id = p_target_id and j.status <> 'hidden' and o.account_status = 'active';
    v_visible := found;
  elsif p_target_type = 'profile' then
    v_owner := p_target_id;
    v_visible := exists (select 1 from public.profiles p where p.id = p_target_id)
                 and public.can_view_profile(p_target_id);
  else
    select c.owner_user_id into v_owner
    from public.centers c
    join public.profiles o on o.id = c.owner_user_id
    where c.id = p_target_id
      and (('center' = any(o.roles) and o.account_status = 'active') or public.is_admin());
    v_visible := found;
  end if;

  if v_owner = v_uid then
    raise exception '내 공고·내 계정은 신고할 수 없어요' using errcode = '22023';
  end if;
  if not v_visible then
    raise exception '신고할 대상을 찾을 수 없어요' using errcode = 'P0002';
  end if;

  -- 같은 사람의 신고는 차례로(동시에 눌러도 한도를 넘지 않게)
  perform pg_advisory_xact_lock(hashtextextended('job_reports:' || v_uid::text, 0));

  if exists (
    select 1 from public.job_reports r
    where r.reporter_id = v_uid
      and r.target_type = p_target_type
      and r.target_id = p_target_id
      and r.created_at > now() - interval '24 hours'
  ) then
    raise exception '이미 신고했어요' using errcode = '22023';
  end if;
  if (
    select count(*) from public.job_reports r
    where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception '신고는 24시간에 20건까지 할 수 있어요' using errcode = '22023';
  end if;

  insert into public.job_reports (reporter_id, target_type, target_id, reason, note)
  values (v_uid, p_target_type, p_target_id, p_reason, v_note)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.submit_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 알림 만들기 (010 정의 기준) + 조치 당사자 조용히(aqua.quiet_user)
--    퇴출 처리 중에는 당사자에게 계정 알림만 보낸다(공고 숨김·제안 마감·미선택 알림을 줄줄이 받지 않게).
--    이 값은 관리자 RPC만 트랜잭션 안에서 잠깐 켠다(회원은 set_config를 부를 길이 없다).
-- ---------------------------------------------------------------------
create or replace function public.aqua_notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_status text;
  v_id uuid;
  v_title text := left(btrim(coalesce(p_title, '')), 80);
  v_body text := left(btrim(coalesce(p_body, '')), 300);
  -- 잠금 화면에 뜨는 푸시는 최소한만: 서류·계정 조치·공고 숨김·마감은 종류·사유 없이 일반 문구
  -- (제목 ''은 발송 API가 브랜드 이름(lib/brand.ts)으로 채운다). 나머지는 센터명·공고 제목까지(앱 안 알림과 같음).
  v_generic boolean := p_kind in ('doc_verified', 'doc_rejected', 'doc_expiring',
                                  'account_suspended', 'account_banned', 'job_hidden', 'application_closed');
  v_push_title text;
  v_push_body text;
begin
  -- 관리자 조치 당사자에게는 계정 알림만(011)
  if p_kind not in ('account_suspended', 'account_banned')
     and current_setting('aqua.quiet_user', true) = p_user::text then
    return null;
  end if;

  select p.account_status into v_status from public.profiles p where p.id = p_user;
  if not found then
    return null;
  end if;
  v_push_title := case when v_generic then '' else v_title end;
  v_push_body := case when v_generic then '앱에서 확인해 주세요' else v_body end;

  insert into public.aqua_notifications (user_id, kind, title, body, link)
  values (p_user, p_kind, v_title, v_body, p_link)
  returning id into v_id;

  -- 기기가 있을 때만 대기열에 넣는다(0행 INSERT도 문장 트리거가 발송 호출을 깨우므로)
  if (v_status = 'active' or p_kind in ('account_suspended', 'account_banned'))
     and exists (select 1 from public.aqua_push_subscriptions s where s.user_id = p_user) then
    insert into public.aqua_push_outbox (notification_id, subscription_id, title, body, link)
    select v_id, s.id, v_push_title, v_push_body, coalesce(p_link, '/')
    from public.aqua_push_subscriptions s
    where s.user_id = p_user;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.aqua_notify(uuid, text, text, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. 관리자 조치
-- ---------------------------------------------------------------------

-- 공고 숨김
create or replace function public.admin_hide_job(p_job uuid, p_reason text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_note text;
  v_job public.job_posts;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요' using errcode = '42501';
  end if;
  v_note := public.job_violation_note(p_reason, p_note);

  -- 잠금 순서: 공고 → 지원·제안(select_applicant·respond_offer와 같다)
  select * into v_job from public.job_posts where id = p_job for update;
  if not found then
    raise exception '공고를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_job.status = 'hidden' then
    raise exception '이미 숨긴 공고예요' using errcode = '22023';
  end if;

  -- 010 알림 트리거가 공고 주인 알림에 사유를 붙인다
  perform set_config('aqua.action_reason', public.job_violation_notice(p_reason, v_note), true);

  update public.job_posts set status = 'hidden' where id = p_job;

  update public.job_applications set status = 'not_selected', decided_at = now()
  where job_id = p_job and status = 'applied';

  update public.job_offers set status = 'expired', responded_at = now()
  where job_id = p_job and status = 'offered';

  insert into public.admin_actions (admin_id, target_user_id, action, reason, note, target_job_id)
  values (auth.uid(), v_job.owner_id, 'job_hidden', p_reason, v_note, p_job);

  perform set_config('aqua.action_reason', '', true);
end;
$$;

revoke execute on function public.admin_hide_job(uuid, text, text) from public, anon;
grant execute on function public.admin_hide_job(uuid, text, text) to authenticated;

-- 계정 상태 바꾸기: 정지 · 퇴출 · 다시 활성
create or replace function public.admin_set_account_status(
  p_user uuid,
  p_status text,
  p_reason text default null,
  p_note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_note text;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'suspended', 'banned') then
    raise exception '계정 상태가 올바르지 않아요' using errcode = '22023';
  end if;
  if p_user is null or p_user = v_uid then
    raise exception '내 계정은 바꿀 수 없어요' using errcode = '42501';
  end if;

  if p_status = 'active' then
    -- 다시 활성: 위반 사유 없음, 설명만(500자까지)
    v_reason := null;
    v_note := nullif(btrim(coalesce(p_note, '')), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception '설명은 500자까지 쓸 수 있어요' using errcode = '22023';
    end if;
  else
    v_reason := p_reason;
    v_note := public.job_violation_note(p_reason, p_note);
  end if;

  select * into v_target from public.profiles where id = p_user for update;
  if not found then
    raise exception '회원을 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if 'admin' = any(v_target.roles) then
    raise exception '관리자 계정은 바꿀 수 없어요' using errcode = '42501';
  end if;
  if v_target.account_status = p_status then
    raise exception '이미 그 상태예요' using errcode = '22023';
  end if;

  -- 010 알림 트리거가 계정 알림에 사유를 붙인다. 퇴출 처리 중 당사자에게는 계정 알림만.
  if p_status <> 'active' then
    perform set_config('aqua.action_reason', public.job_violation_notice(v_reason, v_note), true);
  end if;
  perform set_config('aqua.quiet_user', p_user::text, true);

  update public.profiles set account_status = p_status where id = p_user;

  if p_status = 'banned' then
    -- 모집 중 공고 숨김(이미 마감된 공고는 그대로 — 공개 경로는 '주인 활성' 조건으로 이미 빠진다)
    with hidden as (
      update public.job_posts set status = 'hidden'
      where owner_id = p_user and status = 'open'
      returning id
    )
    update public.job_applications a set status = 'not_selected', decided_at = now()
    from hidden h
    where a.job_id = h.id and a.status = 'applied';

    -- 그 사람 공고의 '보냄' 제안 + 그 사람이 받은 '보냄' 제안 → 마감
    update public.job_offers o set status = 'expired', responded_at = now()
    where o.status = 'offered'
      and (
        o.instructor_id = p_user
        or exists (select 1 from public.job_posts j where j.id = o.job_id and j.owner_id = p_user)
      );

    -- 그 사람이 낸 '지원함' → 미선택
    update public.job_applications set status = 'not_selected', decided_at = now()
    where instructor_id = p_user and status = 'applied';
  end if;

  insert into public.admin_actions (admin_id, target_user_id, action, reason, note)
  values (
    v_uid,
    p_user,
    case p_status
      when 'suspended' then 'account_suspended'
      when 'banned' then 'account_banned'
      else 'account_reactivated'
    end,
    v_reason,
    v_note
  );

  perform set_config('aqua.action_reason', '', true);
  perform set_config('aqua.quiet_user', '', true);
end;
$$;

revoke execute on function public.admin_set_account_status(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_account_status(uuid, text, text, text) to authenticated;

-- 신고 처리: 열린 신고만 resolved(조치함) | dismissed(기각)
create or replace function public.admin_resolve_report(
  p_report uuid,
  p_status text,
  p_resolution text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_report public.job_reports;
  v_resolution text := nullif(btrim(coalesce(p_resolution, '')), '');
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('resolved', 'dismissed') then
    raise exception '처리 결과는 resolved 또는 dismissed여야 해요' using errcode = '22023';
  end if;
  if v_resolution is not null and char_length(v_resolution) > 500 then
    raise exception '처리 메모는 500자까지 쓸 수 있어요' using errcode = '22023';
  end if;

  select * into v_report from public.job_reports where id = p_report for update;
  if not found then
    raise exception '신고를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_report.status <> 'open' then
    raise exception '이미 처리한 신고예요' using errcode = '22023';
  end if;

  update public.job_reports
    set status = p_status, resolved_by = auth.uid(), resolved_at = now(), resolution = v_resolution
  where id = p_report;

  insert into public.admin_actions (admin_id, target_user_id, action, reason, note, target_job_id)
  values (
    auth.uid(),
    public.job_report_target_user(v_report.target_type, v_report.target_id),
    case p_status when 'resolved' then 'report_resolved' else 'report_dismissed' end,
    v_report.reason,
    v_resolution,
    case
      when v_report.target_type = 'job'
       and exists (select 1 from public.job_posts j where j.id = v_report.target_id)
      then v_report.target_id
    end
  );
end;
$$;

revoke execute on function public.admin_resolve_report(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;

-- 신고 목록(관리자): 최근 것부터. p_status가 null이면 전부.
-- 대상 요약만 — 연락처·서류 사진·파일 경로는 없다.
create or replace function public.admin_list_reports(
  p_status text default null,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  id uuid,
  reporter_id uuid,
  reporter_name text,
  target_type text,
  target_id uuid,
  target_user_id uuid,
  target_title text,
  target_center_name text,
  target_job_status text,
  target_account_status text,
  target_open_reports int,
  reason text,
  note text,
  status text,
  created_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'resolved', 'dismissed') then
    raise exception '신고 상태가 올바르지 않아요' using errcode = '22023';
  end if;

  return query
  select
    r.id,
    r.reporter_id,
    rp.display_name,
    r.target_type,
    r.target_id,
    t.uid,
    case r.target_type
      when 'job' then (select j.title from public.job_posts j where j.id = r.target_id)
      when 'profile' then tp.display_name
      else public.aqua_center_label(t.uid)
    end,
    case when r.target_type in ('job', 'center') and t.uid is not null then public.aqua_center_label(t.uid) end,
    case when r.target_type = 'job' then
      (select public.job_effective_status(j) from public.job_posts j where j.id = r.target_id)
    end,
    tp.account_status,
    (
      select count(*)::int from public.job_reports x
      where x.target_type = r.target_type and x.target_id = r.target_id and x.status = 'open'
    ),
    r.reason,
    r.note,
    r.status,
    r.created_at,
    r.resolved_by,
    r.resolved_at,
    r.resolution
  from public.job_reports r
  left join public.profiles rp on rp.id = r.reporter_id
  cross join lateral (select public.job_report_target_user(r.target_type, r.target_id) as uid) t
  left join public.profiles tp on tp.id = t.uid
  where p_status is null or r.status = p_status
  order by r.created_at desc, r.id
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_list_reports(text, int, int) from public, anon;
grant execute on function public.admin_list_reports(text, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 6. PostgREST 스키마 다시 읽기
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
