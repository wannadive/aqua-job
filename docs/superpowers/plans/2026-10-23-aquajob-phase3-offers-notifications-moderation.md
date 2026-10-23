# 아쿠아잡 3단계(제안·알림·신고) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 센터가 강사를 둘러보고 공고를 골라 제안하고(수락 시 연락처 열림), 모든 주요 사건이 앱 안 알림·웹 푸시로 가고, 신고와 관리자 조치(숨김·정지·퇴출)가 돌아가는 3단계를 배포한다.

**Architecture:** 2단계와 같음. 쓰기·권한은 전부 SECURITY DEFINER RPC + RLS. 알림은 DB 트리거가 `aqua_notifications`에 쓰고, 웹 푸시는 워너다이브 검증 구조(outbox → pg_net → `/api/push/flush`)를 아쿠아잡 이름으로 옮겨 쓴다. 결제는 범위 밖(구독 권한 자리 `center_has_product`/`user_has_product`만 사용).

**Tech Stack:** 2단계와 동일 + web-push(VAPID), pg_net, pg_cron(서류 만료 알림)

**Spec:** `docs/superpowers/specs/2026-10-21-aquajob-design.md` §4-2(제안), §7(만료 알림), §7-1(관리자 조치), §9(알림 종류) · `docs/FINFRIENDS_INTEGRATION.md` · 2단계 원장 `.superpowers/sdd/2026-10-22-aquajob-phase2-jobs/progress.md`(유료 전 보안 항목)

**범위 밖:** 결제·구독 결제 화면(나중), 대타 구하기, 앱 안 채팅, 평점·추천.

## Global Constraints

- 2단계 Global Constraints 전부 유지(`.superpowers/sdd/2026-10-22-aquajob-phase2-jobs/global-constraints.md`).
- **보안 1순위**: 모든 새 테이블은 RLS on, 쓰기는 RPC만, 직접 REST 경로도 `is_active()`·구독 확인. 기능마다 역할 매트릭스(anon/강사/센터/관리자/정지·퇴출/겸용) + 교차 계정 SQL 점검.
- 연락처가 열리는 경로는 **선택**과 **제안 수락** 두 가지뿐. 제안 수락도 `get_applicant_contact`와 같은 수준의 서버 확인(공고 주인 + 수락 + 양쪽 활성 + 구독).
- 같은 강사에게 같은 공고로 제안은 한 번. 공고 하나당 보낼 수 있는 제안 수 = 모집 인원 × 5.
- 제안 수락은 선택과 똑같이 모집 인원에 포함되고 인원이 차면 공고 자동 마감(행 잠금).
- 강사 둘러보기는 `talent_profiles.is_public = true`이고 활성인 강사만, 구독 중인 활성 센터만. 연락처 칸 없음.
- 알림 문구 중립, 연락처·서류 내용 넣지 않음. 푸시 본문엔 개인정보 최소(센터명·공고 제목까지).
- 관리자 조치는 정해진 위반 사유에서 고르고 `admin_actions`에 기록, 당사자에게 사유 알림. 평가성 문구 금지.
- 핀프렌즈 규칙: 새 테이블·함수 이름은 도메인 접두어(`job_`, `aqua_`), 도메인 모듈은 app-shell import 금지(경계 테스트), 이름 충돌 회피(워너다이브에 `notifications`, `push_*` 있음 → `aqua_notifications`, `aqua_push_*`).

## Review Focus

1. 비구독·정지 센터가 둘러보기/제안 RPC나 직접 REST로 강사 이력서·연락처를 얻는 경로 → `browse_blocked_*`, `offer_contact_only_owner_accepted`
2. 제안 남발(같은 강사·같은 공고 중복, 공고당 한도 초과, 마감 공고, 비공개 강사) → `offer_limits`
3. 제안 수락과 선택이 동시에 일어나 인원 초과 → `offer_accept_respects_headcount`
4. 알림이 다른 사람에게 보이거나, 푸시 대상이 잘못된 사람 → `notifications_own_only`, push flush가 service role로만
5. 신고 남용(같은 대상 반복 신고) / 관리자 아닌 사람의 조치 RPC → `report_rate_limit`, `admin_actions_admin_only`

---

### Task 1: 유료 전 보안 정리 (2단계 남은 항목)
- migration `20261026_008_pre_paid_security.sql`: `job_applications` 소유 센터 분기에 `job_center_entitled()`(구독) 추가; `get_public_facts(p_user)` — 강사 서류 사실은 `can_view_profile` + (보는 사람이 센터면 구독) 필요; `can_view_profile`의 "대상이 센터 역할" 분기를 센터 공개 정보 범위로 좁히기(겸용 계정의 강사 정보는 강사 규칙을 따르게); `job_posts` 소유 분기 `is_active()`.
- 점검 `phase3_pre_checks.sql`(`pre3 ok`).

### Task 2: 제안 DB (009)
- `job_offers(id, job_id, center_id, instructor_id, message ≤200, status offered|accepted|declined|withdrawn|expired, created_at, responded_at)`, unique(job_id, instructor_id).
- RPC: `browse_instructors(filters jsonb, limit, offset)`(공개·활성 강사의 이력서 공개 필드 + 서류 사실 요약, 연락처 없음), `send_offer(p_job, p_instructor, p_message)`(센터 구독 + `has_requirements('send_offer')` + 공고 open + 강사 공개·활성 + 한도), `withdraw_offer`, `respond_offer(p_offer, p_accept)`(강사 활성 + `user_has_product('aquajob_talent')`; 수락은 공고 행 잠금 + 인원 확인, 인원 차면 마감), `get_offer_contact(p_offer)`(공고 주인 + accepted + 양쪽 활성 + 구독). 공고 마감 시 offered → expired.
- `can_view_profile`/`talent_profiles` 정책: 제안받고 수락한 강사도 그 센터가 이력서 볼 수 있게.
- 점검 `phase3_offers_checks.sql`(`offers ok`).

### Task 3: 알림·푸시 DB (010)
- `aqua_notifications(id, user_id, kind, title, body, link, created_at, read_at)` RLS 본인만, 쓰기는 트리거/RPC.
- 트리거: 지원 선택/미선택, 새 지원자(센터), 제안 도착/수락/거절, 서류 확인/반려, 서류 만료 30일 전·당일(pg_cron 매일 KST 09:00), 관리자 조치(숨김·정지·퇴출).
- 웹 푸시: `aqua_push_subscriptions`(본인만), `aqua_push_outbox`(service만), pg_net으로 `/api/push/flush` 호출(워너다이브 `20261013_push_notifications.sql` 최신 구조를 이름만 바꿔 이식, `sql-latest` 원칙). 환경 변수: VAPID 공개/비공개 키, 플러시 비밀값.
- 점검 `phase3_notify_checks.sql`(`notify ok`).

### Task 4: 신고·관리자 조치 DB (011)
- `job_reports(id, reporter_id, target_type job|profile|center, target_id, reason violation_enum, note ≤500, status open|resolved|dismissed, created_at, resolved_by, resolved_at)`; 같은 사람·같은 대상 24시간 1회.
- 관리자 RPC: `admin_hide_job(p_job, p_reason)`, `admin_set_account_status(p_user, p_status active|suspended|banned, p_reason)`(퇴출 시 그 센터 공고 hidden, 열린 지원·제안 정리), `admin_resolve_report`. 위반 사유: 가짜 서류, 허위 공고, 연락처 수집 목적, 불법 행위, 기타(설명 필수). 전부 `admin_actions` 기록 + 당사자 알림.
- 점검 `phase3_moderation_checks.sql`(`moderation ok`).

### Task 5: 강사 둘러보기·제안 화면
- 센터 `강사 찾기` 탭: 필터(지역, 자격 단체·등급, 가능 요일, 활동 범위, 서류 확인 여부) → 카드(이니셜/사진·경력·꼬리표·소개·서류 사실) → 이력서 보기 → `공고 골라서 제안하기`(모집 중 공고 목록, 한마디) → 보낸 제안 상태.
- 강사 `제안` 탭: 받은 제안(공고 요약·센터·한마디) → 수락(확인 창: `수락하면 이 센터에 내 연락처가 열려요`)/거절. 수락한 제안은 지원 현황과 함께 보이기.
- 센터 지원자 탭에 "제안 수락" 강사도 표시 + 연락처 카드(`get_offer_contact`).

### Task 6: 알림 화면·푸시 켜기
- 상단 종 + 안 읽은 개수, 알림 목록(누르면 해당 화면), 모두 읽음. 푸시 켜기 안내(아이폰은 홈 화면 추가 후). service worker `public/sw.js`(워너다이브 것 참고), `/api/push/flush`(service role, 비밀값 확인).

### Task 7: 신고·관리자 조치 화면
- 공고 상세·센터 프로필·강사 이력서에 `신고하기`(사유 선택 + 설명). 관리자 `신고` 탭: 대상 요약, 사유, 조치(숨김/정지/퇴출/기각) + 확인 창. 차단 화면에 사유 표시. 관리자 회원 탭에서 직접 정지·퇴출(사유 필수).

### Task 8: 문서·버전·배포
- 스펙 §9·§4-2·§7-1 반영, 사용법 안내, RELEASE_NOTES v0.3.0, package.json 0.3.0, Vercel 환경 변수 안내(VAPID 등), SQL 008~011 + 점검 실행, 배포, 교차 계정 실검사.
