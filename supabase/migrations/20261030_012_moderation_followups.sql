-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)의 SQL Editor에서 실행 — 워너다이브 프로젝트에서 실행하지 말 것
-- =====================================================================
-- 아쿠아잡 012: 관리자 조치 후속 — 공고 다시 보이기 · 다시 활성 알림 · 신고 목록에 '대상이 관리자' 칸
-- 001 → … → 011을 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(drop constraint/trigger if exists → 다시 만들기, create or replace,
-- 반환 칸이 바뀌는 admin_list_reports는 drop function if exists 후 다시 만들기).
-- 재정의한 것은 최신 정의를 복사해 고쳤다:
--   aqua_notify(011) · aqua_trg_account_status_notify(010) · aqua_trg_job_hidden_notify(010)
--   · aqua_notifications_kind_check(010) · admin_list_reports(011)
--
-- 규칙
-- 1) admin_unhide_job(공고, 설명): 관리자만(is_admin, 아니면 42501). 내 공고 · 관리자 계정의 공고는 안 된다(42501, 숨김과 같은 규칙).
--    숨긴 공고만(아니면 22023). 공고 주인이 활성이어야 한다(아니면 42501 — 먼저 계정을 다시 활성으로).
--    되돌리는 상태: 숨기기 전에 이미 마감이었으면(closed_reason 있음) 그 마감 그대로,
--      아니면 기간이 지났으면(마감일·수업일·투어 시작일, KST — job_effective_status와 같은 규칙) 마감(expired),
--      인원이 찼으면(job_filled_count ≥ 인원) 마감(full), 그 밖은 모집 중(open).
--    숨길 때 미선택이 된 지원 · 마감된 제안은 되돌리지 않는다. admin_actions에 'job_unhidden'(reason 없음, note) 기록.
--    공고 주인 알림 'job_unhidden'은 트리거가 보낸다(숨김 알림과 같은 트리거 — 숨김에서 풀릴 때만).
--    돌려주는 값: 되돌린 저장 상태('open' | 'closed').
-- 2) 다시 활성 알림: account_status가 suspended|banned → active로 바뀌면 당사자에게 'account_reactivated' 하나.
--    011 admin_set_account_status는 다시 활성 때도 aqua.quiet_user를 켜므로, aqua_notify가 이 종류를 조용히 하기에서 뺀다.
--    잠금 화면 푸시는 일반 문구(종류·사유 없음).
-- 3) admin_list_reports: target_is_admin 칸 추가(조치 버튼 숨김용 — 서버가 최종 관문). 반환 칸이 바뀌므로 drop 후 다시 만든다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 알림 종류: job_unhidden · account_reactivated 추가
--    lib/notifications/config.ts NOTIFICATION_KINDS와 같은 순서(lib/notifications/config.test.ts가 비교)
-- ---------------------------------------------------------------------
alter table public.aqua_notifications drop constraint if exists aqua_notifications_kind_check;
alter table public.aqua_notifications add constraint aqua_notifications_kind_check check (kind in (
  'application_new', 'application_selected', 'application_closed',
  'offer_new', 'offer_accepted', 'offer_declined', 'offer_expired',
  'doc_verified', 'doc_rejected', 'doc_expiring',
  'job_hidden', 'account_suspended', 'account_banned',
  'job_unhidden', 'account_reactivated'
));

-- ---------------------------------------------------------------------
-- 2. 알림 만들기 (011 정의 기준)
--    바뀐 점: 계정 알림 세 종류(정지·퇴출·다시 활성)는 aqua.quiet_user여도 보낸다.
--             잠금 화면 일반 문구 목록에 job_unhidden · account_reactivated 추가.
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
  -- 잠금 화면에 뜨는 푸시는 최소한만: 서류·계정 조치·공고 숨김/다시 보임·마감은 종류·사유 없이 일반 문구
  -- (제목 ''은 발송 API가 브랜드 이름(lib/brand.ts)으로 채운다). 나머지는 센터명·공고 제목까지(앱 안 알림과 같음).
  v_generic boolean := p_kind in ('doc_verified', 'doc_rejected', 'doc_expiring',
                                  'account_suspended', 'account_banned', 'account_reactivated',
                                  'job_hidden', 'job_unhidden', 'application_closed');
  v_push_title text;
  v_push_body text;
begin
  -- 관리자 조치 당사자에게는 계정 알림만(011, 012: 다시 활성 알림 포함)
  if p_kind not in ('account_suspended', 'account_banned', 'account_reactivated')
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
-- 3. 계정 상태 알림 (010 정의 기준) + 다시 활성(정지·퇴출 → 활성)
-- ---------------------------------------------------------------------
create or replace function public.aqua_trg_account_status_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.account_status is distinct from old.account_status then
      if new.account_status = 'suspended' then
        perform public.aqua_notify(new.id, 'account_suspended',
          '계정 이용이 일시 정지됐어요', public.aqua_action_reason_text(), '/');
      elsif new.account_status = 'banned' then
        perform public.aqua_notify(new.id, 'account_banned',
          '계정 이용이 중지됐어요', public.aqua_action_reason_text(), '/');
      elsif new.account_status = 'active' and old.account_status in ('suspended', 'banned') then
        perform public.aqua_notify(new.id, 'account_reactivated',
          '이용이 다시 가능해졌어요', '앱을 다시 이용할 수 있어요', '/');
      end if;
    end if;
  exception when others then
    raise warning 'aqua 계정 알림 실패: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.aqua_trg_account_status_notify() from public, anon, authenticated;

drop trigger if exists aqua_account_status_notify on public.profiles;
create trigger aqua_account_status_notify
  after update of account_status on public.profiles
  for each row execute function public.aqua_trg_account_status_notify();

-- ---------------------------------------------------------------------
-- 4. 공고 숨김 알림 (010 정의 기준) + 다시 보임(hidden → open|closed)
--    마감·모집 중 사이의 다른 상태 변화에는 알리지 않는다(지원자 알림은 지원 행 트리거가 따로 — 다시 보임은 지원 행을 건드리지 않는다).
-- ---------------------------------------------------------------------
create or replace function public.aqua_trg_job_hidden_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.status = 'hidden' and old.status is distinct from 'hidden' then
      perform public.aqua_notify(new.owner_id, 'job_hidden',
        '공고가 숨김 처리됐어요',
        left(new.title, 60) || ' · ' || public.aqua_action_reason_text(),
        '/?tab=jobs&job=' || new.id);
    elsif old.status = 'hidden' and new.status is distinct from 'hidden' then
      perform public.aqua_notify(new.owner_id, 'job_unhidden',
        '공고가 다시 보여요',
        left(new.title, 60) || ' · ' ||
          case when new.status = 'open' then '모집 중으로 돌아왔어요' else '마감 상태로 돌아왔어요' end,
        '/?tab=jobs&job=' || new.id);
    end if;
  exception when others then
    raise warning 'aqua 공고 숨김 알림 실패: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.aqua_trg_job_hidden_notify() from public, anon, authenticated;

drop trigger if exists aqua_job_hidden_notify on public.job_posts;
create trigger aqua_job_hidden_notify
  after update of status on public.job_posts
  for each row execute function public.aqua_trg_job_hidden_notify();

-- ---------------------------------------------------------------------
-- 5. 공고 다시 보이기
-- ---------------------------------------------------------------------
create or replace function public.admin_unhide_job(p_job uuid, p_note text default null)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.job_posts;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_owner_status text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_status text;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception '설명은 500자까지 쓸 수 있어요' using errcode = '22023';
  end if;

  -- 잠금 순서: 공고 먼저(admin_hide_job·select_applicant·respond_offer와 같다)
  select * into v_job from public.job_posts where id = p_job for update;
  if not found then
    raise exception '공고를 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if v_job.owner_id = v_uid
     or exists (select 1 from public.profiles op where op.id = v_job.owner_id and 'admin' = any(op.roles)) then
    raise exception '내 공고·관리자 계정의 공고는 다시 보이게 할 수 없어요' using errcode = '42501';
  end if;
  if v_job.status <> 'hidden' then
    raise exception '숨긴 공고가 아니에요' using errcode = '22023';
  end if;

  select p.account_status into v_owner_status from public.profiles p where p.id = v_job.owner_id;
  if v_owner_status is distinct from 'active' then
    raise exception '공고 주인 계정이 이용 중지 상태예요. 먼저 계정을 다시 활성으로 바꿔 주세요' using errcode = '42501';
  end if;

  if v_job.closed_reason is not null then
    -- 숨기기 전에 이미 마감이었다: 그 마감 그대로
    v_status := 'closed';
    v_reason := v_job.closed_reason;
  elsif v_today > v_job.deadline
     or (v_job.job_type = 'lesson' and v_today > v_job.class_date)
     or (v_job.job_type = 'tour' and v_today > v_job.tour_start) then
    v_status := 'closed';
    v_reason := 'expired';
  elsif public.job_filled_count(v_job.id) >= v_job.headcount then
    v_status := 'closed';
    v_reason := 'full';
  else
    v_status := 'open';
    v_reason := null;
  end if;

  update public.job_posts set status = v_status, closed_reason = v_reason where id = p_job;

  insert into public.admin_actions (admin_id, target_user_id, action, reason, note, target_job_id)
  values (v_uid, v_job.owner_id, 'job_unhidden', null, v_note, p_job);

  return v_status;
end;
$$;

revoke execute on function public.admin_unhide_job(uuid, text) from public, anon;
grant execute on function public.admin_unhide_job(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. 신고 목록 (011 정의 기준) + target_is_admin
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_reports(text, int, int);

create function public.admin_list_reports(
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
  target_is_admin boolean,
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
    coalesce('admin' = any(tp.roles), false),
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
-- 7. PostgREST 스키마 다시 읽기
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
