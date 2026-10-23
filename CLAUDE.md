# 아쿠아잡 (AQUA JOB) - 프리다이빙 강사·센터 연결 플랫폼

강사가 이력서(서류 포함)를 등록하고 센터가 이를 보고 연락하는 모바일 웹 앱. 설계·계획: `docs/superpowers/`.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 16, React 19, TypeScript, Tailwind CSS 3, shadcn/ui |
| 백엔드 | Supabase (PostgreSQL + Auth + RLS + RPC + Storage) |
| 인증 | Supabase Auth (이메일/비밀번호), 역할: `instructor` / `center` / `admin` — 한 계정 여러 역할 가능(아래 멀티 롤) |
| 패키지매니저 | pnpm |
| 테스트 | `pnpm test` (Node 내장 test runner, `lib/**/*.test.ts`) |
| 타겟 환경 | 모바일 웹 (iOS Safari/Chrome, Android Chrome), PWA |

## 프로젝트 구조

```
app/            Next.js App Router (layout, page, globals.css, manifest.ts) — 라우트 URL 고정, 셸 컴포넌트만 import
components/
  app-shell/    셸(합칠 때 교체): app-router, auth/, role-tabs, blocked-screen, intro/, legal/, *-shell.tsx
  jobs/         공고·지원 (도메인)
  verification/ 서류 확인 (도메인) + admin/(review-queue, review-detail)
  talent-profile/  강사 이력서 (도메인)
  center-listing/  센터 소개 (도메인)
  shared/       공용 UI 조각 (step-question)
  ui/           shadcn
lib/
  app-shell/    셸: auth-provider.tsx(useAuth), account/, intro/
  jobs/ verification/ talent-profile/ center-listing/ avatar/   도메인 모듈 (types·logic·api·mappers)
  supabase/     client.ts, admin.ts, database.types.ts, keep-login.ts (공용, 위치 유지)
  brand.ts      브랜드 값(이름·태그라인)은 여기서만 읽기
  image.ts      이미지 압축 (compressImage)
  boundaries.test.ts   도메인→셸 import 금지 검사
supabase/       schema / policies / functions (SQL)
docs/           설계·계획·기능 명세, FINFRIENDS_INTEGRATION.md
```

## 규칙

### 중립 원칙
- "검증된", "보증", "추천 강사", "인증됨" 같은 문구를 쓰지 않는다.
- 서류는 사실로만 표시한다. 예: `AIDA 강사 자격증 · 2027.03까지`
- 본인이 입력한 값은 "(본인 입력)"으로 구분한다.
- 사용자에게 보이는 글은 전부 한국어.

### 연락처 / 서류 원본 경계
- 연락처(휴대폰·이메일)는 `private_contacts` 테이블에만 둔다. 1단계에서는 본인과 관리자만 읽는다.
- 서류 원본은 Storage 비공개 버킷 `verification-docs`에만 둔다(006 이전 테스트 서류만 옛 버킷 `documents`에 남음 — 행의 `bucket` 칸을 따른다). 본인과 관리자만 읽는다.
- 신분증(`id_card`, `representative_id`)은 확인 후 원본을 삭제한다.
- 접근 제어는 RLS로 한다. 화면에서 숨기는 것만으로 끝내지 않는다.
- 직접 REST 경로(테이블 select 정책)도 is_active·구독 확인: RPC에만 관문을 두지 말고, 남의 데이터를 읽는 정책 분기에는 `(select public.is_active())`와 필요한 구독(`job_center_entitled()` 등)을 함께 건다(007).
- 남의 센터 정보(`center_profiles`)와 회원 id(공고 `owner_id`, 센터 `user_id`)는 SECURITY DEFINER RPC로만 내보내고, 회원 id는 주인·관리자에게만 준다(007).
- 강사 정보(이력서·강사 서류 사실·강사 이름)는 `job_can_view_talent()` 하나로 판정(본인·관리자·구독 센터 × 공개 이력서/내 공고 지원자). 활성 센터 역할 대상이라는 이유로는 profiles 행(이름)만 열린다 — 정지·퇴출 센터 이름은 본인·관리자만(008). 새로 강사 정보를 여는 조건은 이 함수 안에만 더한다(009: 내 공고의 제안을 수락한 강사).
- 연락처가 열리는 RPC는 `get_applicant_contact`(선택)와 `get_offer_contact`(제안 수락) 둘뿐(009). 모집 인원은 선택한 지원 + 수락한 제안(`job_filled_count`) — 인원을 세는 곳은 모두 이 함수를 쓴다.
- 공고 지역 목록은 DB `job_region_options()`와 `lib/talent-profile/config.ts`의 `REGION_OPTIONS` 두 곳 — 함께 고친다(`lib/jobs/regions.test.ts`가 다르면 실패). 공고 입력 한도는 `lib/jobs/config.ts`의 `JOB_LIMITS`와 DB `job_post_from_payload`가 같아야 한다.

### 모듈
- 새 기능은 `lib/<도메인>/` 모듈(types·logic·api·store)로 만든다. 순수 로직은 `*.test.ts`로 테스트한다.
- 브랜드·색 값 하드코딩 금지. 색은 `app/globals.css`의 B안 토큰(`bg`, `ink`, `accent`, `muted`, `warn`, `ok`)을 쓰고 카드는 `rounded-card`(18px).

### 멀티 롤
- `profiles.roles text[]`(가진 역할 전부) + `profiles.role`(대표·가입 역할, 항상 roles 안). 일반 가입은 역할 하나, 여러 역할은 관리자가 SQL로 준다(`supabase/migrations/20261022_003_multi_role.sql` 맨 아래). roles는 관리자·서버만 바꾼다(트리거). role만 바꾸면 roles 안의 예전 역할이 새 역할로 바뀐다(더해지지 않음) — 여러 역할을 줄 땐 roles를 직접 적는다.
- 권한 확인은 role이 아니라 roles로: SQL은 `admin = any(roles)`(`is_admin()`) / `roles && array[...]`, 앱은 `user.roles.includes(...)`. 서류 종류 구분은 가입 역할이 아니라 `DOC_TYPES[docType].owner`.
- 보고 있는 역할 화면은 `useAuth().activeRole`(localStorage `aqua.activeRole`, `resolveActiveRole`로 검증, 기본은 관리자 → 가입 역할). 라우팅은 `routeFor(user, introSeen, activeRole)`, 역할이 둘 이상이면 상단 `RoleTabs`.

### Mutation
- DB mutation 호출에는 반드시 `await`를 붙인다. 없으면 에러가 삼켜지고 성공 toast만 뜬다.
- 에러가 나면 `toast.error` (sonner) 후 early return. 성공 시에만 refetch.

### Supabase
- 브라우저 클라이언트는 `@supabase/supabase-js`의 `createClient`를 쓴다 (`createBrowserClient` 금지 - getSession()이 hang). `lib/supabase/client.ts`(fetch 15초 타임아웃, lock 우회, 싱글턴)를 그대로 쓴다.
- `database.types.ts`가 수동 작성이라 `.from()` mutation과 `.rpc()`에는 `as any`가 필요하다 (Supabase v2 타입 추론 `never` 이슈).

## 핀프렌즈 합류 대비 규칙
AQUA JOB은 나중에 핀프렌즈(`../wanna-dive`)에 합쳐진다. 계획·충돌·체크리스트: `docs/FINFRIENDS_INTEGRATION.md`.

- 새 테이블·함수·버킷은 도메인 접두어(`job_`, `verification_`, `talent_`)를 붙인다. `documents`, `settings` 같은 일반 이름 금지.
- 센터 데이터는 `center_id → centers.id`. `user_id`를 센터 대신 쓰지 않는다. 권한 = "이 센터의 관리자인가". 지금 `centers`는 센터 역할 계정마다 한 행(`owner_user_id`, 트리거가 만든다), 합칠 때 `center_members`로.
- 유료 기능 권한은 `center_has_product(센터, 상품)` / `user_has_product(회원, 상품)`로만 확인한다(상품: `aquajob`·`aquajob_talent`·`center_app`). RPC·정책에서 `paid_mode`로 직접 분기하지 않는다(화면 안내용으로 읽는 것은 괜찮다).
- 강사 이력서·서류 확인은 플랫폼 수준(center_id 없음). 공고는 공유 레이어(visibility public).
- WD에 있는 함수 이름(`is_admin`, `handle_new_user`, `guard_profile_privileged_columns`, `update_updated_at`)과 시그니처가 다른 함수를 새로 만들지 않는다.
- 공용 함수를 재정의할 때는 가장 최근 마이그레이션 정의를 복사한다(옛 파일 복사 시 중간 규칙 유실).
- 폴더 규칙: 셸(라우팅·로그인·역할 전환·*-shell)은 `components/app-shell/`, `lib/app-shell/`. 도메인은 `lib/<도메인>/` + `components/<도메인>/`. 새 기능은 도메인 모듈로 만들고 셸에 로직을 얹지 않는다.
- 경계 규칙: **도메인 모듈은 app-shell을 import하지 않는다**(허용: `lib/supabase/client`, `components/ui`, `components/shared`). 현재 사용자·역할·콜백은 props로 받는다(예: `ResumeWizard onComplete`). 새 도메인 폴더를 만들면 `lib/boundaries.test.ts`의 `DOMAIN_DIRS`에 추가한다. `pnpm test`가 위반을 잡는다.

## 테스트
```
pnpm test    # scripts/run-tests.mjs 가 lib 아래 *.test.ts 를 찾아 node --test 로 실행 (0개면 통과)
pnpm build
```

## 커밋 규칙
- 기능 추가/변경/삭제 시 해당 스펙·계획 문서(`docs/`)를 같은 커밋에서 함께 수정한다. 코드와 문서를 분리하지 않는다.
- git 쓰기 전에 현재 폴더와 브랜치를 확인한다 (옆 폴더 저장소 `wanna-dive`와 혼동 주의).

## 환경 변수
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # 서버 전용, NEXT_PUBLIC_ 금지
```
(`.env.local.example` 참고. 세 값 모두 Vercel의 Production·Preview 둘 다에 넣는다. `.env.local.example` 외의 `.env*`는 커밋 금지)
