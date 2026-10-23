# 핀프렌즈 합류 준비 (AQUA JOB → FinFriends)

AQUA JOB은 나중에 핀프렌즈(워너다이브의 발전형, `dev/wanna-dive`)에 **구인구직 도메인 모듈**로 합쳐진다.
이 문서는 합칠 때 부딪힐 곳과, 그걸 줄이려고 지금 해 둔 것/합치는 날 할 것을 정리한다.
근거: `docs/VISION.md`(wanna-dive), 분석 원문 `.superpowers/sdd/2026-10-22-aquajob-phase2-jobs/merge-analysis.md`.

## 1. 개념 매핑

| AQUA JOB | 핀프렌즈 | 방향 |
|---|---|---|
| `profiles` (display_name, role, roles, account_status) | WD `profiles` (name, email, phone, roles, status/approval_status) | 같은 개념. 합칠 때 display_name→name, account_status→status |
| role `admin` | 플랫폼 운영자 | WD admin = 센터1 관리자 → 합칠 때 `platform_admin` 분리 |
| role `center` + `center_profiles` (user_id PK) | 테넌트 `centers.id` + 센터 관리자 | 계정 ≠ 센터. 공고는 센터 소속, 센터 관리자가 작성 |
| role `instructor` + `instructor_profiles` | 플랫폼 수준 강사 이력서 | center_id 없음. 소속은 별개(VISION §3) |
| `job_posts` / `job_applications` | 공유(공개) 시장 레이어 | `job_posts.center_id → centers.id`, visibility public |
| `documents` | 플랫폼 수준 확인 | owner_id 기준. 센터 서류는 나중에 center_id로 |

목표 모델: 핀프렌즈 `centers` 하나에 `kind = 'managed' | 'listing'`, `center_members(center_id, user_id, role)`.
AQUA 센터 계정은 합칠 때 해당 센터의 owner 멤버가 된다.

## 2. 충돌 목록

**테이블**
- `instructor_profiles`: 이름은 같고 개념이 다름(WD는 센터 강사 소개 카드, PK instructor_id) → 이름 변경 필수 (`talent_profiles`)
- `app_settings`: WD는 value TEXT, AQUA는 jsonb → 변경 필수 (`aqua_settings`)
- `documents`: WD `center_documents`와 혼동 → 변경 권장 (`verification_documents`)
- `requirement_rules` → `verification_requirements`, `admin_actions`는 일반적인 이름(합칠 때 병합), `center_profiles`는 합칠 때 정리

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
                  components/verification/admin/   review-queue, review-detail, 원본 삭제 대기 UI
lib/talent-profile/ + components/talent-profile/   강사 이력서 (resume-*)
lib/center-listing/ + components/center-listing/   센터 소개 (center-profile-form)
lib/avatar/api.ts                                  아바타 업로드/URL
```

### 공용 — 위치 유지 (WD와 같은 경로)
```
lib/supabase/ (client, admin, database.types, keep-login)   lib/brand.ts   lib/image.ts   lib/utils.ts
components/ui/ (shadcn)
components/shared/step-question.tsx   공용 UI 조각 (셸·도메인 어디서든 import 가능)
```

### 경계 규칙
도메인 → 셸 import 금지(`lib/boundaries.test.ts`가 `pnpm test`에서 검사). 예외 없음; 공용(`lib/supabase/client`,
`components/ui`, `components/shared`)은 셸이 아니다. 현재 사용자·역할·콜백은 props로 받는다
(예: `ResumeWizard`는 `onComplete`를 받고, 셸이 `refreshAccount`를 넘김).
셸 → 도메인 import는 자유.

## 4. DB 계획

**지금 (Task 4c, `006_merge_ready`)**
- `instructor_profiles→talent_profiles`, `documents→verification_documents`, `requirement_rules→verification_requirements`, `app_settings→aqua_settings` (`admin_actions`는 유지)
- 이름이 바뀐 테이블을 참조하는 함수는 **최신 정의**(005/004)에서 복사해 재정의, 정책 이름도 변경
- Storage `documents` 버킷 → `verification-docs` (테스트 파일만 있음)
- `centers(id, owner_user_id, name, kind 'listing', created_at)` 신설 + 기존 센터 백필, `center_profiles.center_id`
- `create_job_post`가 `job_posts.center_id`를 채우고 → NOT NULL, `get_center_public_profile`은 center_id 기준
- `NOTIFY pgrst`, `phase2_merge_ready_checks.sql`

**합칠 때까지 미룸**: `is_admin` 시그니처 통일, `profiles` 컬럼 통일, `center_members`, 연락처 병합,
`handle_new_user`/guard 병합, `admin_actions` 병합, `platform_admin` 역할.

## 5. 합치는 날 체크리스트

- [ ] `is_admin`: WD `is_admin(p_uid uuid default auth.uid())`로 통일. AQUA의 `is_admin()` 호출은 인자 없이도 동작하므로 정책 수정 불필요한지 확인
- [ ] `profiles` 컬럼: display_name→name, account_status→status, email/phone 추가. `roles text[]` 규칙 맞추기
- [ ] `centers`: AQUA `centers`(kind 'listing')를 WD `centers`에 `kind`('managed'|'listing') 컬럼으로 합치고, `center_members(center_id, user_id, role)` 신설, AQUA `owner_user_id`를 owner 멤버로 이관
- [ ] 연락처: AQUA `private_contacts`와 WD profiles의 phone/email 관계 결정(병합 또는 유지), RLS 재확인
- [ ] `handle_new_user` + `guard_profile_privileged_columns` + 트리거 `profiles_guard_privileged`를 수작업 병합(최신 정의 파일 기준)
- [ ] `admin_actions` 병합(컬럼·정책), 감사 기록 유지
- [ ] Storage `avatars` 정책을 `{uid}/...` 기준으로 하나로 병합, `verification-docs` 정책 유지
- [ ] `platform_admin` 역할 도입: AQUA admin → platform_admin, WD admin(센터1 관리자)은 그대로. 서류 심사·공고 관리 RLS를 platform_admin 기준으로
- [ ] 셸 교체: `components/app-shell`, `lib/app-shell`을 WD 셸(`useAuth`, 라우터, 역할 전환)로 대체하고, 도메인 화면을 WD 라우팅에 연결(props 주입)
- [ ] `app/` 라우트 병합(URL 유지), `lib/brand.ts`의 브랜드 값 통일
- [ ] `lib/boundaries.test.ts` 경로 목록 갱신 후 `pnpm test` / `typecheck` / `build`
- [ ] 일반 이름 함수(`effective_doc`, `get_public_facts`, `has_requirements`, `can_view_profile`, `paid_mode`, `is_active`)가 WD와 겹치지 않는지 확인
