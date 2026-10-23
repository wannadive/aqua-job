-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)의 SQL Editor에서 실행 — 워너다이브 프로젝트에서 실행하지 말 것
-- =====================================================================
-- 아쿠아잡 010: 앱 안 알림 · 웹 푸시 · 서류 만료 알림
-- 001 → … → 009를 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(create table/index if not exists, drop constraint/policy/trigger if exists →
-- 다시 만들기, create or replace, cron 예약은 지우고 다시).
--
-- 실행 전 준비(Supabase 대시보드 → Database → Extensions): pg_net, pg_cron 두 확장을 켠다.
--   이 파일도 켜 보려고 하지만(create extension if not exists), 권한 때문에 실패하면 안내만 남기고 넘어간다.
--   pg_net이 없으면 푸시가 바로 나가지 않고, pg_cron이 없으면 서류 만료 알림이 예약되지 않는다
--   (켠 뒤 이 파일을 다시 실행하면 된다).
-- 실행 뒤 한 번(값은 Vercel과 똑같이):
--   insert into public.aqua_push_config (key, value) values
--     ('flush_url', 'https://<아쿠아잡 배포 도메인>/api/push/flush'),
--     ('flush_secret', '<Vercel PUSH_FLUSH_SECRET 값>')
--   on conflict (key) do update set value = excluded.value;
--
-- 구조(워너다이브 20261013_push_notifications · 20261020_push_hardening 최신 정의를 아쿠아잡 이름으로 옮김)
--   사건(트리거) → aqua_notify() → aqua_notifications(앱 안 알림) + aqua_push_outbox(기기별 대기열)
--   → 대기열 INSERT 문장마다 pg_net이 POST {flush_url} (헤더 x-aqua-push-secret)
--   → /api/push/flush(service role, 비밀값 확인)가 aqua_claim_push_outbox로 가져가 web-push(VAPID)로 보냄.
--   워너다이브와 다른 점: 대기열 행이 받는 기기(구독)마다 하나, 발송 호출에 비밀값 헤더 필수,
--   설정표(aqua_push_config)는 service role도 못 읽음(트리거 함수만), 알림 종류는 아쿠아잡 것만.
--
-- 보안 규칙
-- 1) aqua_notifications: 본인 행만 조회. 직접 쓰기(insert/update/delete) 권한 없음.
--    읽음 표시는 aqua_mark_read / aqua_mark_all_read RPC(본인 행의 read_at만)로만.
--    정지·퇴출 당사자도 자기 알림은 읽는다(차단 화면에서 사유를 보여 주려고).
-- 2) 알림을 만드는 것은 aqua_notify(내부 전용 — 실행 권한은 소유자만)와 그것을 부르는 트리거뿐.
--    문구는 중립, 연락처·서류 내용(사진·번호) 없음. 센터명·공고 제목·서류 종류·반려 사유까지만.
--    link는 앱 안 주소만('/'로 시작, '//'·'/\' 금지, 공백·제어문자 금지) — 표 제약으로 막는다.
-- 3) 푸시 구독(aqua_push_subscriptions): 본인 행만 조회·삭제. 저장은 aqua_save_push_subscription RPC로만
--    (활성 회원, 주소는 https + 알려진 푸시 서비스 주소만, 한 사람 최대 10대).
-- 4) aqua_push_outbox·aqua_push_config·aqua_doc_expiry_notices: 회원 접근 권한 없음.
--    대기열은 service role만(aqua_claim_push_outbox), 설정표는 트리거 함수만 읽는다.
-- 5) 푸시는 활성 회원에게만. 단, 계정 정지·퇴출 알림은 당사자에게 보낸다.
--    푸시 내용 = 제목·본문·링크만(발송 API가 그 셋만 싣는다). 잠금 화면에 뜨므로 서류·계정 조치·공고 숨김·마감 알림은
--    "앱에서 확인해 주세요"(제목은 브랜드 이름)만 — 서류 종류·사유는 앱 안 알림에만. 나머지는 센터명·공고 제목까지.
--    대기열에 쌓인 뒤 발송 호출은 트랜잭션마다 한 번(aqua.push_kicked).
-- 6) 알림 만들기가 실패해도 원래 작업(지원·선택·제안·서류 확인)은 막지 않는다(트리거가 경고만 남김).
-- 7) 지원 취소·재지원 반복: 센터의 새 지원자 알림은 같은 지원 행에 대해 24시간에 한 번.
--
-- 관리자 조치 사유 전달(Task 4가 쓰는 자리): 관리자 RPC가 상태를 바꾸기 직전에
--   perform set_config('aqua.action_reason', '<사유 문구>', true);
-- 를 부르면 계정 정지·퇴출·공고 숨김 알림 본문에 '사유: …'가 붙는다(없으면 '자세한 내용은 앱에서 확인해 주세요').
-- 계정 상태·공고 숨김은 관리자·서버만 바꿀 수 있으므로(guard 트리거·쓰기 정책 없음) 회원이 이 값을 넣어도 쓸 데가 없다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 확장: pg_net(즉시 발송 호출). 켤 수 없으면 안내만 남긴다.
-- ---------------------------------------------------------------------
do $ext$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net 확장을 켤 수 없음: % (Database → Extensions에서 pg_net을 켠 뒤 이 파일을 다시 실행)', sqlerrm;
end $ext$;

-- ---------------------------------------------------------------------
-- 1. 앱 안 알림
-- ---------------------------------------------------------------------
create table if not exists public.aqua_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text null,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

-- 종류 목록은 lib/notifications/config.ts의 NOTIFICATION_KINDS와 같아야 한다(lib/notifications/config.test.ts가 비교).
alter table public.aqua_notifications drop constraint if exists aqua_notifications_kind_check;
alter table public.aqua_notifications add constraint aqua_notifications_kind_check check (kind in (
  'application_new', 'application_selected', 'application_closed',
  'offer_new', 'offer_accepted', 'offer_declined', 'offer_expired',
  'doc_verified', 'doc_rejected', 'doc_expiring',
  'job_hidden', 'account_suspended', 'account_banned'
));

alter table public.aqua_notifications drop constraint if exists aqua_notifications_text_check;
alter table public.aqua_notifications add constraint aqua_notifications_text_check
  check (char_length(title) between 1 and 80 and char_length(body) <= 300);

-- 앱 안 주소만: '/'로 시작, 두 번째 글자가 '/'·'\'가 아님(//evil.com 같은 다른 사이트 주소 금지), 공백·제어문자 없음
alter table public.aqua_notifications drop constraint if exists aqua_notifications_link_check;
alter table public.aqua_notifications add constraint aqua_notifications_link_check check (
  link is null or (
    char_length(link) <= 300
    and left(link, 1) = '/'
    and substr(link, 2, 1) not in ('/', '\')
    and link !~ '[[:space:][:cntrl:]]'
  )
);

create index if not exists aqua_notifications_user_created_idx
  on public.aqua_notifications (user_id, created_at desc);
create index if not exists aqua_notifications_user_unread_idx
  on public.aqua_notifications (user_id) where read_at is null;

alter table public.aqua_notifications enable row level security;

revoke all on public.aqua_notifications from anon;
revoke insert, update, delete, truncate, references, trigger on public.aqua_notifications from authenticated;

drop policy if exists aqua_notifications_select_own on public.aqua_notifications;
create policy aqua_notifications_select_own on public.aqua_notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 읽음 표시: 내 알림 중 고른 것(최대 500개). 바뀐 개수를 돌려준다.
create or replace function public.aqua_mark_read(p_ids uuid[])
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_ids) > 500 then
    raise exception '한 번에 500개까지 읽음 표시할 수 있어요' using errcode = '22023';
  end if;

  update public.aqua_notifications set read_at = now()
  where user_id = v_uid and id = any(p_ids) and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.aqua_mark_read(uuid[]) from public, anon;
grant execute on function public.aqua_mark_read(uuid[]) to authenticated;

-- 모두 읽음
create or replace function public.aqua_mark_all_read()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = '42501';
  end if;
  update public.aqua_notifications set read_at = now()
  where user_id = v_uid and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.aqua_mark_all_read() from public, anon;
grant execute on function public.aqua_mark_all_read() to authenticated;

-- 안 읽은 개수. SECURITY INVOKER — RLS(본인 행)가 그대로 걸린다.
create or replace function public.aqua_unread_count()
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int from public.aqua_notifications
  where user_id = auth.uid() and read_at is null;
$$;

revoke execute on function public.aqua_unread_count() from public, anon;
grant execute on function public.aqua_unread_count() to authenticated;

-- ---------------------------------------------------------------------
-- 2. 웹 푸시 구독 (기기마다 한 행, endpoint = 기기)
-- ---------------------------------------------------------------------
create table if not exists public.aqua_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists aqua_push_subscriptions_user_idx on public.aqua_push_subscriptions (user_id);

alter table public.aqua_push_subscriptions enable row level security;

revoke all on public.aqua_push_subscriptions from anon;
revoke insert, update, truncate, references, trigger on public.aqua_push_subscriptions from authenticated;

drop policy if exists aqua_push_subscriptions_select_own on public.aqua_push_subscriptions;
create policy aqua_push_subscriptions_select_own on public.aqua_push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists aqua_push_subscriptions_delete_own on public.aqua_push_subscriptions;
create policy aqua_push_subscriptions_delete_own on public.aqua_push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 알려진 푸시 서비스 주소만(https, 호스트 바로 뒤 '/') — 서버가 임의 주소로 요청을 보내지 않게.
-- 워너다이브 _is_push_endpoint(20261020) 그대로: FCM(크롬·안드로이드) · 애플 · 모질라 · 윈도우.
create or replace function public.aqua_is_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    char_length(p_endpoint) <= 1000
    and p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)/',
    false
  );
$$;

revoke execute on function public.aqua_is_push_endpoint(text) from public, anon;
grant execute on function public.aqua_is_push_endpoint(text) to authenticated;

-- 구독 저장(같은 기기를 다른 계정이 쓰면 주인을 바꾼다). 활성 회원만. 한 사람 최근 10대까지만 남긴다.
create or replace function public.aqua_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_active() then
    raise exception '활성 계정만 알림을 켤 수 있어요' using errcode = '42501';
  end if;
  if not public.aqua_is_push_endpoint(p_endpoint) then
    raise exception '알 수 없는 알림 주소예요' using errcode = '22023';
  end if;
  -- 키는 base64url 글자만, 길이 제한
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{20,200}={0,2}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{8,100}={0,2}$' then
    raise exception '알림 키 형식이 올바르지 않아요' using errcode = '22023';
  end if;

  -- 같은 기기를 다른 계정이 가져가면, 이전 계정 앞으로 쌓여 아직 안 보낸 푸시는 지운다(새 주인에게 가지 않게)
  delete from public.aqua_push_outbox o
  using public.aqua_push_subscriptions s
  where s.endpoint = p_endpoint and s.user_id <> v_uid
    and o.subscription_id = s.id and o.sent_at is null;

  insert into public.aqua_push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = v_uid, p256dh = excluded.p256dh, auth = excluded.auth, last_used_at = now();

  delete from public.aqua_push_subscriptions s
  where s.user_id = v_uid
    and s.id not in (
      select k.id from public.aqua_push_subscriptions k
      where k.user_id = v_uid
      order by k.last_used_at desc, k.id
      limit 10
    );
end;
$$;

revoke execute on function public.aqua_save_push_subscription(text, text, text) from public, anon;
grant execute on function public.aqua_save_push_subscription(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 발송 대기열 (서버 전용 — 회원 권한·정책 없음). 받는 기기마다 한 행.
-- ---------------------------------------------------------------------
create table if not exists public.aqua_push_outbox (
  id bigserial primary key,
  notification_id uuid null references public.aqua_notifications(id) on delete cascade,
  subscription_id uuid not null references public.aqua_push_subscriptions(id) on delete cascade,
  title text not null,
  body text not null,
  link text not null default '/',
  created_at timestamptz not null default now(),
  sent_at timestamptz null
);

create index if not exists aqua_push_outbox_pending_idx
  on public.aqua_push_outbox (id) where sent_at is null;
create index if not exists aqua_push_outbox_subscription_idx
  on public.aqua_push_outbox (subscription_id);

alter table public.aqua_push_outbox enable row level security;
revoke all on public.aqua_push_outbox from public, anon, authenticated;
revoke all on sequence public.aqua_push_outbox_id_seq from public, anon, authenticated;

-- 발송 API가 대기분을 한 번에 가져가며 보냄 표시(동시 호출 중복 발송 방지, 하루 지난 것은 버림).
-- 받는 기기 주소·키를 함께 돌려준다. service role만 실행.
create or replace function public.aqua_claim_push_outbox(p_limit int default 100)
returns table (
  id bigint,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  title text,
  body text,
  link text
)
language sql
volatile
security definer
set search_path = public
as $$
  with c as (
    update public.aqua_push_outbox o set sent_at = now()
    where o.id in (
      select x.id from public.aqua_push_outbox x
      where x.sent_at is null and x.created_at > now() - interval '1 day'
      order by x.id
      limit greatest(1, least(coalesce(p_limit, 100), 500))
      for update skip locked
    )
    returning o.id, o.subscription_id, o.title, o.body, o.link
  )
  select c.id, c.subscription_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.link
  from c
  join public.aqua_push_subscriptions s on s.id = c.subscription_id
  order by c.id;
$$;

revoke execute on function public.aqua_claim_push_outbox(int) from public, anon, authenticated;
grant execute on function public.aqua_claim_push_outbox(int) to service_role;

-- 설정표: 발송 API 주소(flush_url)와 비밀값(flush_secret). 회원·service role 모두 접근 권한 없음 —
-- 아래 트리거 함수(소유자 권한)만 읽는다. 값은 SQL Editor에서 넣는다(파일 머리말 참고).
create table if not exists public.aqua_push_config (
  key text primary key check (key in ('flush_url', 'flush_secret')),
  value text not null
);

alter table public.aqua_push_config enable row level security;
revoke all on public.aqua_push_config from public, anon, authenticated, service_role;

-- 대기열에 쌓이면 발송 API 호출(문장마다 1회, 비동기). https 주소와 비밀값이 둘 다 있을 때만.
-- 실패해도 원래 작업은 계속(알림 실패가 지원·선택을 막지 않게).
create or replace function public.aqua_push_outbox_kick()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  -- 한 트랜잭션에 한 번만 부른다(발송 API는 커밋 뒤 대기열 전부를 가져가므로 충분하다)
  if current_setting('aqua.push_kicked', true) = '1' then
    return null;
  end if;
  -- 설정 읽기도 아래 exception 안에서(선언부에서 읽으면 오류가 잡히지 않는다)
  select c.value into v_url from public.aqua_push_config c where c.key = 'flush_url';
  select c.value into v_secret from public.aqua_push_config c where c.key = 'flush_secret';
  if v_url is null or v_url !~ '^https://' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  perform set_config('aqua.push_kicked', '1', true);
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-aqua-push-secret', v_secret)
  );
  return null;
exception when others then
  return null;
end;
$$;

revoke execute on function public.aqua_push_outbox_kick() from public, anon, authenticated;

drop trigger if exists aqua_push_outbox_kick on public.aqua_push_outbox;
create trigger aqua_push_outbox_kick
  after insert on public.aqua_push_outbox
  for each statement execute function public.aqua_push_outbox_kick();

-- ---------------------------------------------------------------------
-- 4. 알림 만들기 (내부 전용)
-- ---------------------------------------------------------------------

-- 알림 1건 + 받는 사람의 기기마다 대기열 1행. 푸시는 활성 회원에게만(계정 조치 알림은 당사자에게도).
-- 실행 권한은 소유자만(트리거·관리자 RPC 같은 SECURITY DEFINER 함수 안에서만 부른다).
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

-- 센터 표시 이름(공고 요약과 같은 규칙: 센터 소개의 센터명, 없으면 회원 이름), 30자까지. 내부 전용.
create or replace function public.aqua_center_label(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select left(coalesce(nullif(btrim(cp.center_name), ''), p.display_name, '센터'), 30)
  from public.profiles p
  left join public.center_profiles cp on cp.user_id = p.id
  where p.id = p_owner;
$$;

revoke execute on function public.aqua_center_label(uuid) from public, anon, authenticated, service_role;

-- 서류 종류 이름. lib/verification/config.ts DOC_TYPES의 label과 같아야 한다(lib/notifications/config.test.ts가 비교).
create or replace function public.aqua_doc_label(p_doc_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_doc_type
    when 'instructor_cert' then '강사 자격증'
    when 'liability_insurance' then '강사 배상책임보험'
    when 'first_aid' then '응급처치·CPR'
    when 'id_card' then '신분증'
    when 'business_registration' then '사업자등록증'
    when 'travel_business' then '여행업 등록증'
    when 'representative_id' then '대표자 신분증'
    when 'rep_instructor_cert' then '대표강사 자격증'
    else '서류'
  end;
$$;

-- 관리자 조치 사유(관리자 RPC가 set_config('aqua.action_reason', …, true)로 넘김) → 본문
create or replace function public.aqua_action_reason_text()
returns text
language sql
stable
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(current_setting('aqua.action_reason', true), '')), '') is null
      then '자세한 내용은 앱에서 확인해 주세요'
    else '사유: ' || left(btrim(current_setting('aqua.action_reason', true)), 100)
  end;
$$;

revoke execute on function public.aqua_action_reason_text() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. 트리거: 사건 → 알림
--    링크 규칙(앱 안 주소, Task 6 화면이 읽는다):
--      /?tab=applicants&job=<공고>[&app=<지원>]  센터 — 새 지원자(app 포함), 제안 수락·거절
--      /?tab=applications&job=<공고> 강사 — 선택됨, 마감(미선택)
--      /?tab=offers&offer=<제안>     강사 — 제안 도착, 제안 마감
--      /?tab=documents               서류 확인·반려·만료 임박
--      /?tab=jobs&job=<공고>         센터 — 공고 숨김
--      /                             계정 정지·퇴출
-- ---------------------------------------------------------------------

-- 지원: 새 지원(재지원 포함) → 센터, 선택 → 강사, 미선택(공고 마감) → 강사
create or replace function public.aqua_trg_application_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.job_posts;
begin
  begin
    select * into v_job from public.job_posts where id = new.job_id;
    if not found then
      return null;
    end if;

    if new.status = 'applied' and (tg_op = 'INSERT' or old.status = 'withdrawn') then
      -- 지원 취소·재지원을 반복해도 센터에는 같은 지원(공고·강사 = 지원 행) 알림을 24시간에 한 번만
      if not exists (
        select 1 from public.aqua_notifications n
        where n.user_id = v_job.owner_id
          and n.kind = 'application_new'
          and n.link = '/?tab=applicants&job=' || v_job.id || '&app=' || new.id
          and n.created_at > now() - interval '24 hours'
      ) then
        perform public.aqua_notify(v_job.owner_id, 'application_new',
          '새 지원자가 있어요', left(v_job.title, 60),
          '/?tab=applicants&job=' || v_job.id || '&app=' || new.id);
      end if;
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      if new.status = 'selected' then
        perform public.aqua_notify(new.instructor_id, 'application_selected',
          public.aqua_center_label(v_job.owner_id) || '에서 선택했어요', left(v_job.title, 60),
          '/?tab=applications&job=' || v_job.id);
      elsif new.status = 'not_selected' then
        perform public.aqua_notify(new.instructor_id, 'application_closed',
          '지원한 공고가 마감됐어요', left(v_job.title, 60),
          '/?tab=applications&job=' || v_job.id);
      end if;
    end if;
  exception when others then
    raise warning 'aqua 지원 알림 실패: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.aqua_trg_application_notify() from public, anon, authenticated;

drop trigger if exists aqua_application_notify on public.job_applications;
create trigger aqua_application_notify
  after insert or update of status on public.job_applications
  for each row execute function public.aqua_trg_application_notify();

-- 제안: 도착 → 강사, 수락·거절 → 센터(공고 주인), 마감 → 강사. 철회는 알리지 않는다.
create or replace function public.aqua_trg_offer_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.job_posts;
begin
  begin
    select * into v_job from public.job_posts where id = new.job_id;
    if not found then
      return null;
    end if;

    if tg_op = 'INSERT' then
      if new.status = 'offered' then
        perform public.aqua_notify(new.instructor_id, 'offer_new',
          public.aqua_center_label(v_job.owner_id) || '에서 제안이 왔어요', left(v_job.title, 60),
          '/?tab=offers&offer=' || new.id);
      end if;
    elsif new.status is distinct from old.status and old.status = 'offered' then
      if new.status = 'accepted' then
        perform public.aqua_notify(v_job.owner_id, 'offer_accepted',
          '보낸 제안이 수락됐어요', left(v_job.title, 60),
          '/?tab=applicants&job=' || v_job.id);
      elsif new.status = 'declined' then
        perform public.aqua_notify(v_job.owner_id, 'offer_declined',
          '보낸 제안이 거절됐어요', left(v_job.title, 60),
          '/?tab=applicants&job=' || v_job.id);
      elsif new.status = 'expired' then
        perform public.aqua_notify(new.instructor_id, 'offer_expired',
          '받은 제안이 마감됐어요', left(v_job.title, 60),
          '/?tab=offers&offer=' || new.id);
      end if;
    end if;
  exception when others then
    raise warning 'aqua 제안 알림 실패: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.aqua_trg_offer_notify() from public, anon, authenticated;

drop trigger if exists aqua_offer_notify on public.job_offers;
create trigger aqua_offer_notify
  after insert or update of status on public.job_offers
  for each row execute function public.aqua_trg_offer_notify();

-- 서류: 확인 대기 → 확인됨/반려 → 주인. 반려는 사유(관리자가 고른 문구)까지, 사진·번호는 넣지 않는다.
create or replace function public.aqua_trg_document_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if old.status = 'submitted' and new.status is distinct from old.status then
      if new.status = 'verified' then
        perform public.aqua_notify(new.owner_id, 'doc_verified',
          '서류 확인이 끝났어요', public.aqua_doc_label(new.doc_type),
          '/?tab=documents');
      elsif new.status = 'rejected' then
        perform public.aqua_notify(new.owner_id, 'doc_rejected',
          '서류가 반려됐어요',
          public.aqua_doc_label(new.doc_type)
            || coalesce(' · 사유: ' || left(nullif(btrim(new.reject_reason), ''), 60), ''),
          '/?tab=documents');
      end if;
    end if;
  exception when others then
    raise warning 'aqua 서류 알림 실패: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.aqua_trg_document_notify() from public, anon, authenticated;

drop trigger if exists aqua_document_notify on public.verification_documents;
create trigger aqua_document_notify
  after update of status on public.verification_documents
  for each row execute function public.aqua_trg_document_notify();

-- 계정 정지·퇴출 → 당사자 (사유는 aqua.action_reason)
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

-- 공고 숨김(관리자 조치) → 공고 주인 (사유는 aqua.action_reason)
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
-- 6. 서류 만료 알림: 유효 서류(effective_doc)의 유효기간이 정확히 30일 뒤 또는 오늘(KST)이면 주인에게.
--    같은 서류·같은 날은 한 번만(aqua_doc_expiry_notices). 활성 회원만. 매일 09:00 KST(00:00 UTC) 예약.
-- ---------------------------------------------------------------------
create table if not exists public.aqua_doc_expiry_notices (
  doc_id uuid not null references public.verification_documents(id) on delete cascade,
  notice_day date not null,
  created_at timestamptz not null default now(),
  primary key (doc_id, notice_day)
);

alter table public.aqua_doc_expiry_notices enable row level security;
revoke all on public.aqua_doc_expiry_notices from public, anon, authenticated;

create or replace function public.aqua_notify_expiring_docs()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  r record;
  v_n int := 0;
begin
  for r in
    select d.id, d.owner_id, d.doc_type, d.valid_until
    from public.verification_documents d
    join public.profiles p on p.id = d.owner_id and p.account_status = 'active'
    where d.status = 'verified'
      and d.valid_until in (v_today, v_today + 30)
      and (public.effective_doc(d.owner_id, d.doc_type)).id = d.id
    order by d.id
  loop
    -- 한 건이 실패해도 나머지는 계속한다. 실패한 건은 기록도 함께 되돌아가 같은 날 다시 돌리면 다시 시도한다.
    begin
      insert into public.aqua_doc_expiry_notices (doc_id, notice_day)
      values (r.id, v_today)
      on conflict do nothing;
      if found then
        perform public.aqua_notify(r.owner_id, 'doc_expiring',
          public.aqua_doc_label(r.doc_type)
            || case when r.valid_until = v_today then ' 유효기간이 오늘까지예요' else ' 유효기간이 30일 남았어요' end,
          '새 서류를 올리면 확인 뒤 반영돼요',
          '/?tab=documents');
        v_n := v_n + 1;
      end if;
    exception when others then
      raise warning 'aqua 서류 만료 알림 실패: %', sqlerrm;
    end;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.aqua_notify_expiring_docs() from public, anon, authenticated, service_role;

-- 오래된 대기열·만료 알림 기록 정리(매일 예약 작업에서 부른다)
create or replace function public.aqua_push_outbox_cleanup()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.aqua_push_outbox where created_at < now() - interval '7 days';
  delete from public.aqua_doc_expiry_notices where notice_day < (now() at time zone 'Asia/Seoul')::date - 60;
$$;

revoke execute on function public.aqua_push_outbox_cleanup() from public, anon, authenticated, service_role;

-- pg_cron 예약: 매일 00:00 UTC = 09:00 KST. 이미 같은 이름으로 예약돼 있으면 그대로 둔다.
do $cron$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron 확장을 켤 수 없음: % (Database → Extensions에서 pg_cron을 켠 뒤 이 파일을 다시 실행)', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 다시 실행하면 지우고 새로 예약(시각·명령을 고친 것이 반영되게)
    if exists (select 1 from cron.job where jobname = 'aqua-daily-notify') then
      perform cron.unschedule('aqua-daily-notify');
    end if;
    perform cron.schedule(
      'aqua-daily-notify',
      '0 0 * * *',
      'select public.aqua_notify_expiring_docs(); select public.aqua_push_outbox_cleanup();'
    );
  end if;
exception when others then
  raise notice '서류 만료 알림 예약 실패: % (pg_cron을 켠 뒤 이 파일을 다시 실행)', sqlerrm;
end $cron$;

-- ---------------------------------------------------------------------
-- 7. PostgREST 스키마 다시 읽기
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
