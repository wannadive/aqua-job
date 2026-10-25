# 핀프렌즈 합류 준비 (AQUA JOB → FinFriends)

AQUA JOB은 나중에 핀프렌즈(워너다이브의 발전형, `dev/wanna-dive`)에 **구인구직 도메인 모듈**로 합쳐진다.
이 문서는 합칠 때 부딪힐 곳과, 그걸 줄이려고 지금 해 둔 것/합치는 날 할 것을 정리한다.
근거: `docs/VISION.md`(wanna-dive), 분석 원문 `.superpowers/sdd/2026-10-22-aquajob-phase2-jobs/merge-analysis.md`.

## 1. 개념 매핑

| AQUA JOB | 핀프렌즈 | 방향 |
|---|---|---|
| `profiles` (display_name, role, roles, account_status) | WD `profiles` (name, email, phone, roles, status/approval_status) | 같은 개념. 합칠 때 display_name→name, account_status→status |
| role `admin` | 플랫폼 운영자 | WD admin = 센터1 관리자 → 합칠 때 `platform_admin` 분리 |
| role `center` + `center_profiles` (user_id PK, `center_id`) + `centers` (006) | 테넌트 `centers.id` + 센터 관리자 | 계정 ≠ 센터. 공고는 센터 소속(`job_posts.center_id`), 센터 관리자가 작성 |
| role `instructor` + `talent_profiles` (006, 옛 `instructor_profiles`) | 플랫폼 수준 강사 이력서 | center_id 없음. 소속은 별개(VISION §3) |
| `job_posts` / `job_applications` | 공유(공개) 시장 레이어 | `job_posts.center_id → centers.id`, visibility public |
| `verification_documents` (006, 옛 `documents`) + 버킷 `verification-docs` | 플랫폼 수준 확인 | owner_id 기준. 센터 서류는 나중에 center_id로 |
| `aqua_settings` (006, 옛 `app_settings`) · `verification_requirements` (006, 옛 `requirement_rules`) | — | AQUA 전용 설정·요건 표. WD `app_settings`(value TEXT)와 분리 |

목표 모델: 핀프렌즈 `centers` 하나에 `kind = 'managed' | 'listing'`, `center_members(center_id, user_id, role)`.
AQUA 센터 계정은 합칠 때 해당 센터의 owner 멤버가 된다.

## 2. 충돌 목록

**테이블**
- `instructor_profiles`: 이름은 같고 개념이 다름(WD는 센터 강사 소개 카드, PK instructor_id) → 이름 변경 필수 (`talent_profiles`)
- `app_settings`: WD는 value TEXT, AQUA는 jsonb → 변경 필수 (`aqua_settings`)
- `documents`: WD `center_documents`와 혼동 → 변경 권장 (`verification_documents`)
- `requirement_rules` → `verification_requirements`, `admin_actions`는 일반적인 이름(합칠 때 병합), `center_profiles`는 합칠 때 정리

- 알림·푸시(010): WD에 `notifications`(message·type·category·read)·`push_subscriptions`·`push_outbox`·`push_preferences`·`push_config`가 있어 AQUA는 `aqua_notifications`·`aqua_push_subscriptions`·`aqua_push_outbox`·`aqua_push_config`·`aqua_doc_expiry_notices`로 따로 둔다(아래 4절 "알림 합치기")

**함수 / 트리거**
- `is_admin()`: AQUA는 인자 없음, WD는 `is_admin(p_uid uuid default auth.uid())` → 합칠 때 통일
- `handle_new_user`, `guard_profile_privileged_columns`, 트리거 `profiles_guard_privileged`: 수작업 병합
- 일반 이름: `effective_doc`, `get_public_facts`, `has_requirements`, `can_view_profile`, `paid_mode`, `is_active`

**Storage**
- `avatars`: 같은 개념(`{uid}/...`) → 병합
- `documents` 버킷: 이름 변경 권장 (`verification-docs`)

**lib/ · components/** (이번 작업으로 해소)
- `lib/instructor/`(WD recent-records와 충돌) → `lib/talent-profile/`
- `lib/storage/avatars.ts` ↔ WD `lib/avatar/api.ts` → `lib/avatar/api.ts`로 같은 자리
- `lib/supabase/auth-provider.tsx` (WD에도 있음) → `lib/app-shell/auth-provider.tsx`
- `components/admin|instructor|auth|shared/`, `app-router.tsx` (셸) → `components/app-shell/`
- `role-tabs` ↔ WD `shared/role-switcher`, `legal` ↔ WD `shared/legal-doc` → 셸 안에 두고 합칠 때 WD 것으로 교체

## 3. 폴더 지도 (현재 실제 경로)

### 셸 — 합칠 때 WD 것으로 교체/흡수
```
app/                                   라우트는 URL 그대로 (셸 컴포넌트만 import)
components/app-shell/
  app-router.tsx                       역할별 라우팅
  auth/ (login-form, signup-form, signup-select)
  role-tabs.tsx, blocked-screen.tsx
  intro/intro-slides.tsx, legal/legal-page.tsx
  admin-shell.tsx, instructor-shell.tsx, center-shell.tsx
lib/app-shell/
  auth-provider.tsx                    SupabaseAuthProvider + useAuth
  account/ (types, logic, active-role, admin-api)
  intro/slides.ts
```

### 도메인 — 그대로 옮겨 붙임
```
lib/jobs/ + components/jobs/                       공고·지원 (device-key.ts 포함)
lib/verification/ + components/verification/       서류 확인 (document-*, fact-badge)
                  components/verification/admin/   review-queue(원본 삭제 대기 목록 `PendingPurges` 포함), review-detail
lib/talent-profile/ + components/talent-profile/   강사 이력서 (resume-*) · 자격 단체·등급 목록(config `CERT_LEVELS`)과
                                                   판정(logic `certLevelChoice`·`formatCert`) — 강사 찾기 필터(lib/offers)도 이것을 쓴다
lib/center-listing/ + components/center-listing/   센터 소개 (center-profile-form)
lib/avatar/api.ts                                  아바타 업로드/URL
lib/notifications/ + components/notifications/     앱 안 알림(종·목록·모두 읽음)·푸시 켜기/끄기·로그아웃 때 구독 정리,
                                                   링크 해석·역할 화면 연결(link.ts), 발송 순수 로직(flush.ts).
                                                   합칠 때 WD notifications·push_*와 병합(4절) — 셸은 NotificationsProvider·NotificationBar·
                                                   NotificationPanel만 끼우고, 이동은 셸이 onOpenLink로 받는다
lib/offers/ + components/offers/                   강사 둘러보기·제안(보내기·철회·수락/거절) — 연락처 카드는 components/jobs/applicant-contact 공용
lib/moderation/ + components/moderation/           신고하기(report-button: 공고 상세·센터 프로필·강사 이력서) · 관리자 신고 탭(admin-reports)
                                                   · 조치 확인 창(action-dialog: 공고 숨김·다시 보이기(012)·정지·퇴출·다시 활성, resolve-dialog: 처리 완료·기각)
                                                   · 회원 탭 조치 버튼(member-actions) · 차단 화면 사유(blocked-notice — 내 계정 알림 본문에서 읽음).
                                                   쓰기는 011 RPC만. 셸은 AdminReports·MemberActions·BlockedNotice만 끼우고
                                                   현재 회원 id·활성 여부·로그아웃은 props로 넘긴다(JobViewer.active, reporterId, viewerId)
```

### 공용 — 위치 유지 (WD와 같은 경로)
```
lib/supabase/ (client, admin, database.types, keep-login)   lib/brand.ts   lib/image.ts   lib/utils.ts
components/ui/ (shadcn)
components/shared/ (step-question, use-focus-item — 알림에서 온 항목 찾아 강조)
components/shared/step-question.tsx   공용 UI 조각 (셸·도메인 어디서든 import 가능)
```

### 경계 규칙
도메인 → 셸 import 금지(`lib/boundaries.test.ts`가 `pnpm test`에서 검사). 예외 없음; 공용(`lib/supabase/client`,
`components/ui`, `components/shared`)은 셸이 아니다. 현재 사용자·역할·콜백은 props로 받는다
(예: `ResumeWizard`는 `onComplete`를 받고, 셸이 `refreshAccount`를 넘김).
셸 → 도메인 import는 자유.

## 4. DB 계획

**완료 (Task 4c, `supabase/migrations/20261024_006_merge_ready.sql`)** — 검사: `supabase/test/phase2_merge_ready_checks.sql` (`merge ok`)
- [x] `instructor_profiles→talent_profiles`, `documents→verification_documents`, `requirement_rules→verification_requirements`, `app_settings→aqua_settings` (`admin_actions`는 유지). 제약·인덱스·트리거·정책 이름도 새 테이블 이름으로
- [x] 이름이 바뀐 테이블을 쓰는 함수는 **최신 정의**에서 복사해 재정의: `effective_doc`·`has_requirements`(004), `review_document`(001), `can_view_profile`·`paid_mode`·`get_public_facts`(005)
- [x] Storage 비공개 버킷 `verification-docs` + 정책(옛 `documents` 버킷 정책 002 기준 복사). `verification_documents.bucket` 칸: 006 이전 행은 `documents`, 새 행은 `verification-docs`(앱의 서명 주소·원본 삭제는 행의 bucket을 따른다). Storage 객체는 SQL로 옮기지 않았다
- [x] `centers(id, owner_user_id unique, name, kind 'listing'|'managed', created_at)` 신설 + 센터 역할 계정 백필. 센터 역할이 생기면(가입·역할 변경) 트리거가 행을 만들고, `center_profiles.center_name`이 바뀌면 `centers.name`을 맞춘다. 누구나 id·name·kind만 읽는다(칸 권한), 쓰기는 트리거만
- [x] `center_profiles.center_id`(트리거가 항상 주인의 센터로 고정), `job_posts.center_id` 백필 → NOT NULL + 외래 키, `create_job_post`가 채움
- [x] `get_center_public_profile(p_center_id)` · `list_center_job_history(p_center_id)`는 `centers.id`로 찾는다. 공고 요약·상세·이력에 `center_id` 칸 추가
- [x] 구독 권한 자리 `center_has_product` / `user_has_product` (아래 6절)
- [x] `NOTIFY pgrst`

**남은 정리 (테스트 데이터를 지운 뒤)**: 옛 Storage 버킷 `documents`와 그 정책(`documents_owner_*`, `documents_admin_*`)을 지우고 `verification_documents_bucket_check`를 `verification-docs` 하나로 좁힌다.

**알림 합치기 (010, `20261028_010_notifications`)** — 지금은 WD와 따로(이름 충돌 회피), 합칠 때 결정:
- 앱 안 알림: AQUA `aqua_notifications(kind, title, body, link, read_at)` ↔ WD `notifications(message, type, category, related_id, read)`. 합칠 때 WD 표로 옮기려면 kind→category(예: `aquajob_*`) 매핑, title+body→message, link는 WD 딥링크 형식으로 바꾼다. 또는 AQUA 표를 그대로 두고 종 화면이 두 표를 합쳐 보여 준다(종 개수·읽음 처리 두 번 주의).
- 푸시 구독: 기기(endpoint)는 하나라 `aqua_push_subscriptions`를 WD `push_subscriptions`로 합친다(endpoint unique 충돌 시 last_used_at 최신 우선). 같은 기기에 대기열·발송 API가 둘이면 같은 알림이 두 번 갈 수 있으니 발송 API(`/api/push/flush`)도 하나로 합친다 — WD는 비밀값 없이 호출(멱등), AQUA는 `x-aqua-push-secret` 필수: 합칠 때 비밀값 방식으로 통일 권장.
- 알림 설정: WD `push_preferences`(종류별 끄기)가 AQUA엔 없다 — 합칠 때 AQUA 종류를 한 칸(예: `aquajob`)으로 넣는다.
- VAPID 키: 두 앱이 다른 키를 쓰면 기기 구독이 키에 묶여 있어 합칠 때 다시 구독해야 한다. 같은 도메인으로 합칠 계획이면 그때 키 하나로 정하고 재구독 안내.
- 예약 작업: pg_cron `aqua-daily-notify`(00:00 UTC, 서류 만료 알림·대기열 정리)는 이름이 겹치지 않아 그대로 둘 수 있다.

**합칠 때까지 미룸**: `is_admin` 시그니처 통일, `profiles` 컬럼 통일, `center_members`, 연락처 병합,
`handle_new_user`/guard 병합, `admin_actions` 병합, `platform_admin` 역할.

## 5. 합치는 날 체크리스트

- [ ] `is_admin`: WD `is_admin(p_uid uuid default auth.uid())`로 통일. AQUA의 `is_admin()` 호출은 인자 없이도 동작하므로 정책 수정 불필요한지 확인
- [ ] `profiles` 컬럼: display_name→name, account_status→status, email/phone 추가. `roles text[]` 규칙 맞추기
- [ ] `centers`: AQUA `centers`(006, kind 'listing')를 WD `centers`에 `kind`('managed'|'listing') 컬럼으로 합치고(둘 다 uuid), `center_members(center_id, user_id, role)` 신설, AQUA `owner_user_id`를 owner 멤버로 이관. AQUA의 센터 트리거(`profiles_ensure_center`, `center_profiles_link_center`, `center_profiles_sync_center_name`)는 WD 센터 생성 흐름으로 대체
- [ ] 구독: `center_has_product`/`user_has_product`를 WD 결제·구독 표에 연결(센터앱 `center_app` 포함), 묶음 상품 규칙 반영
- [ ] 연락처: AQUA `private_contacts`와 WD profiles의 phone/email 관계 결정(병합 또는 유지), RLS 재확인
- [ ] `handle_new_user` + `guard_profile_privileged_columns` + 트리거 `profiles_guard_privileged`를 수작업 병합(최신 정의 파일 기준)
- [ ] `admin_actions` 병합(컬럼·정책), 감사 기록 유지 — AQUA는 011에서 `note`·`target_job_id` 칸을 더했다(조치 사유 코드는 `reason`). 신고 표 `job_reports`(011)는 접두어가 있어 그대로 옮긴다(`target_type` center = `centers.id`)
- [ ] Storage `avatars` 정책을 `{uid}/...` 기준으로 하나로 병합, `verification-docs` 정책 유지(옛 `documents` 버킷이 남아 있으면 먼저 정리)
- [ ] `platform_admin` 역할 도입: AQUA admin → platform_admin, WD admin(센터1 관리자)은 그대로. 서류 심사·공고 관리 RLS를 platform_admin 기준으로
- [ ] 셸 교체: `components/app-shell`, `lib/app-shell`을 WD 셸(`useAuth`, 라우터, 역할 전환)로 대체하고, 도메인 화면을 WD 라우팅에 연결(props 주입)
- [ ] `app/` 라우트 병합(URL 유지), `lib/brand.ts`의 브랜드 값 통일
- [ ] `lib/boundaries.test.ts` 경로 목록 갱신 후 `pnpm test` / `typecheck` / `build`
- [ ] 일반 이름 함수(`effective_doc`, `get_public_facts`, `has_requirements`, `can_view_profile`, `paid_mode`, `is_active`)가 WD와 겹치지 않는지 확인

## 6. 요금·구독 (결정됨, 2026-10-23)

- **센터**: 아쿠아잡 센터 월 구독 `aquajob` → 공고 등록·강사에게 제안.
- **프리랜서 강사**: 아쿠아잡 강사 월 구독 `aquajob_talent` → 공고 상세 열람·지원(·제안 수락).
- **센터앱**(핀프렌즈 센터 운영 기능) 구독 `center_app`과 **따로 팔거나 묶어서** 판다(Adobe 제품 묶음처럼). 공고 건당 결제는 하지 않는다.
- **무료 기간**(`aqua_settings.paid_mode = false`)에는 전부 열려 있다. 결제(PG)·구독 표는 나중에 붙인다.

### 권한 자리 (006)
- `center_has_product(p_center_id, p_product)`, `user_has_product(p_user, p_product)` — SECURITY DEFINER, stable.
  무료 기간이면 true. 유료 전환 후에는 결제 표가 생기기 전까지 **운영자(관리자) 계정만** true(자리만).
  본인·자기 센터·관리자·서버 세션만 물어볼 수 있고(남의 것은 false), 모르는 상품 이름은 false.
- 연결된 곳: `create_job_post` → 호출자 센터의 `aquajob`. `can_view_job_detail`(→ `get_job_detail`, 센터 공개 프로필 상세 칸) →
  관리자 · 공고 주인 · 강사의 `aquajob_talent` · 자기 센터의 `aquajob`. `apply_to_job` → 강사의 `aquajob_talent`.
  비로그인 요약(`list_public_jobs`, `get_job_summary`, 센터 공개 프로필 기본 칸)은 그대로 누구나.
- 007(`20261025_007_phase2_hardening`): `update_job_post`·`select_applicant`·`get_applicant_contact`·`talent_profiles` 센터 조회 정책도 호출자 센터의 `aquajob`(`job_center_entitled()`)을 확인한다. `close_job_post`는 구독 없이도 된다.
  공개 RPC(`list_public_jobs`·`get_job_summary`·`get_job_detail`)의 `owner_id`와 `get_center_public_profile`의 `user_id`는 주인·관리자에게만(그 밖에는 null) — 센터 구분은 `center_id`, 센터 서류 사실은 `get_center_public_facts(center_id)`. `center_profiles` 직접 조회는 주인·관리자만.
- 008(`20261026_008_pre_paid_security`): `job_applications` 공고 주인 분기도 `job_center_entitled()`(구독 없는 센터는 지원자 이름·한마디도 직접 조회 불가). `job_posts` 주인 분기는 활성 계정만.
- **강사 정보 vs 센터 이름 (008)**: 강사 정보(이력서 `talent_profiles` · 강사 서류 사실 · 강사 이름)는 `job_can_view_talent(대상)` 하나로 판정한다 —
  본인 · 관리자 · (보는 사람이 활성 + 구독 센터(`job_center_entitled()`) × (대상의 이력서가 공개 또는 대상이 내 공고에 지원, 취소 제외)).
  `can_view_profile`의 "대상이 센터 역할" 분기는 **활성** 센터의 profiles 행(이름 등 계정 기본 칸)만 연다(정지·퇴출 센터는 본인·관리자만) — 겸용(센터+강사) 계정이라도 이 분기로는
  강사 정보가 열리지 않는다. `get_public_facts`는 센터 서류 4종(사업자등록증·여행업·대표자 신분증·대표 강사 자격증)만 "대상이 활성 센터면 누구나",
  그 밖의 서류는 로그인 + `job_can_view_talent`. 강사 정보를 여는 새 조건(예: 제안 수락)은 `job_can_view_talent` 안에만 더한다.
- 009(`20261027_009_offers`): 제안. `browse_instructors`는 호출자 센터의 `aquajob`(`job_center_entitled()`), `send_offer`는 공고 센터의 `aquajob`(`center_has_product`) + 제안 서류 요건(`has_requirements('send_offer')`), `respond_offer` 수락은 강사의 `aquajob_talent`(거절은 구독 없이), `get_offer_contact`는 `get_applicant_contact`와 같은 확인(공고 주인 활성 + 센터 `aquajob` + 수락 + 강사 활성). `job_offers` 직접 조회도 공고 주인 분기에 `job_center_entitled()`. `job_can_view_talent`에 "내 공고의 제안을 수락한 강사"를 더했다. 모집 인원은 선택한 지원 + 수락한 제안(`job_filled_count`).
- 010(`20261028_010_notifications`): 알림·푸시는 구독과 상관없이 동작(알림 받는 것은 유료 기능이 아님). 푸시는 활성 회원만(계정 정지·퇴출 알림만 당사자에게).
- 011(`20261029_011_moderation`): 신고(`submit_report`)·관리자 조치(`admin_*`)는 구독과 상관없다(활성 회원·관리자 여부만). 관리자 조치 RPC는 `is_admin()` — 합칠 때 `platform_admin` 기준으로 바꾼다.
- 결제를 붙일 때는 이 두 함수 안만 바꾼다(구독 표 조회). RPC·정책에서 `paid_mode`로 직접 분기하지 않는다.

### centers: 지금 vs 합칠 때
- **지금**: `centers` 한 행 = 센터 역할 계정 하나(`owner_user_id` unique, `kind = 'listing'`). 권한 판정은 "이 센터의 주인인가".
- **합칠 때**: WD `centers`에 합치고 `center_members(center_id, user_id, role)`로 여러 관리자. `owner_user_id`는 owner 멤버로 옮긴다.
  권한 판정을 "이 센터의 관리자 멤버인가"로 바꿔도 `center_has_product` 호출부는 그대로 둔다.

### 열린 질문
- **핀프렌즈 센터 소속 강사의 아쿠아잡 지원**: (1) 소속 강사도 `aquajob_talent`를 따로 결제하는가, 아니면 센터의 센터앱·아쿠아잡 구독에 포함하는가.
  (2) 소속 강사가 **다른 센터 공고**에 지원하는 것을 허용하는가 — 센터의 "소속 강사 보호" 원칙과 충돌할 수 있다(센터 설정으로 둘지 포함). 결정 전에는 지금 규칙(프리랜서와 같음)으로 둔다.
