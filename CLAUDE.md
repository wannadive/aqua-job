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
app/            Next.js App Router (layout, page, globals.css, manifest.ts)
components/     화면 컴포넌트 (ui/ = shadcn, 이후 auth/ instructor/ center/ admin/ ...)
lib/
  brand.ts      브랜드 값(이름·태그라인)은 여기서만 읽기
  supabase/     client.ts, database.types.ts
  image.ts      이미지 압축 (compressImage)
  <도메인>/     새 기능은 types·logic·api(·store)로 나눈 모듈로
supabase/       schema / policies / functions (SQL)
docs/           설계·계획·기능 명세
```

## 규칙

### 중립 원칙
- "검증된", "보증", "추천 강사", "인증됨" 같은 문구를 쓰지 않는다.
- 서류는 사실로만 표시한다. 예: `AIDA 강사 자격증 · 2027.03까지`
- 본인이 입력한 값은 "(본인 입력)"으로 구분한다.
- 사용자에게 보이는 글은 전부 한국어.

### 연락처 / 서류 원본 경계
- 연락처(휴대폰·이메일)는 `private_contacts` 테이블에만 둔다. 1단계에서는 본인과 관리자만 읽는다.
- 서류 원본은 Storage 비공개 버킷 `documents`에만 둔다. 본인과 관리자만 읽는다.
- 신분증(`id_card`, `representative_id`)은 확인 후 원본을 삭제한다.
- 접근 제어는 RLS로 한다. 화면에서 숨기는 것만으로 끝내지 않는다.

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
