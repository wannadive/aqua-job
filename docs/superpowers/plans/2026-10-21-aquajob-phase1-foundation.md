# 아쿠아잡 1단계(기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인·가입, 도입부 슬라이드, 강사 이력서, 센터 프로필, 서류 제출과 관리자 서류 확인까지 돌아가는 아쿠아잡 첫 버전을 배포한다.

**Architecture:** 워너다이브와 같은 구성이다. Next.js App Router 모바일 웹(PWA)에 Supabase(Postgres + Auth + RLS + Storage + RPC)를 붙인다. 도메인마다 `lib/<도메인>/`(types·config·logic·api) 모듈을 둔다. 순수 로직은 `node:test`로 검사한다. 권한은 RLS와 SECURITY DEFINER RPC로 강제하고, SQL 검사 스크립트로 확인한다. 연락처와 서류 원본은 처음부터 별도 테이블과 비공개 버킷에 둔다.

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5.7.3, Tailwind 3.4, shadcn/ui, @supabase/supabase-js ^2.95.3, sonner, zod, pnpm, Node 24(`node --test` + TS strip-types)

**Spec:** `docs/superpowers/specs/2026-10-21-aquajob-design.md`

**전체 로드맵 (이 문서는 1단계만 다룬다)**
- 1단계(이 문서): 기반 · 인증 · 도입부 · 이력서/센터 프로필 · 서류 제출/확인 · 배포
- 2단계(별도 계획): 공고 3종(서류 요건 검사) · 공개 목록/상세(잠금) · 조회수 · 지원 · 선택(인원 잠금) · 연락처 열람 · 자동 마감
- 3단계(별도 계획): 강사 둘러보기·제안 · 알림·웹푸시·만료 알림 · 신고·숨김/정지/퇴출 · 유료 관문 스위치 · 약관 확정(초안은 1단계 최종 리뷰에서 `/terms`·`/privacy` 정적 페이지로 먼저 만듦, 운영자 정보 칸은 사용자가 채움)

## Global Constraints

- 사용자에게 보이는 글은 전부 한국어다.
- 중립 원칙(§2):
  - "검증된", "보증", "추천 강사", "인증됨" 같은 문구를 쓰지 않는다.
  - 서류는 사실로만 표시한다. 예: `AIDA 강사 자격증 · 2027.03까지`
  - 본인이 입력한 값은 "(본인 입력)"으로 구분한다.
- 디자인 B안 토큰: 바탕 `#F4F8FB`, 글자·주 버튼 `#0E2235`, 포인트 `#0AA88E`, 보조 글자 `#6B7F92`, 카드 흰색 + 둥근 18px, 경고(만료·마감 임박) 앰버 `#B7791F` / 배경 `#FFF1D6`, 확인됨 배경 `#DDF7F1` / 글자 `#0A8F79`
- 훈련 기록 순서: STA → DYN → CWT → FIM
- 브랜드 값은 `lib/brand.ts`에서만 읽는다(하드코딩 금지).
- Supabase 브라우저 클라이언트는 `@supabase/supabase-js`의 `createClient`를 쓴다(`createBrowserClient` 금지). 워너다이브 `lib/supabase/client.ts` 방식(fetch 15초 타임아웃, lock 우회, 싱글턴)을 그대로 쓴다.
- mutation 호출에는 반드시 `await`를 붙이고, 에러가 나면 `toast.error` 후 early return 한다.
- 역할: `instructor` | `center` | `admin` (Task 9b부터 한 계정 여러 역할 가능: `profiles.roles`, 상단 역할 탭)
- 연락처(휴대폰·이메일)는 `private_contacts` 테이블에만 둔다. 1단계에서는 본인과 관리자만 읽을 수 있다.
- 서류 원본은 Storage 비공개 버킷 `documents`에 둔다. 본인과 관리자만 읽을 수 있다. 신분증(`id_card`, `representative_id`)은 확인하면 원본을 삭제한다.
- 모바일 웹 기준이다(iOS Safari·Chrome, Android Chrome).

## Review Focus

1. **다른 사람의 연락처나 서류 원본을 읽으려는 요청.** 다른 강사, 센터, 로그인하지 않은 사람이 시도하면 RLS가 빈 결과나 거부를 돌려줘야 한다. → Task 3 SQL 검사 `rls_contacts_hidden`, `rls_documents_private`
2. **유효기간이 오늘인 서류와 어제 만료된 서류.** 오늘까지는 유효, 어제 만료는 "만료됨", 30일 이내는 "곧 만료". 시간대 때문에 하루 밀리면 안 된다. → Task 2 `displayStatus 경계` 테스트
3. **반려 후 다시 제출.** 같은 종류 서류를 새로 올리면 새 제출 건이 "확인 대기"가 되고 반려 기록은 남는다. 강사 화면에는 최신 건만 보인다. → Task 2 `latestByType` 테스트, Task 3 SQL `resubmit_after_reject`
4. **정지·퇴출된 계정이 로그인한 경우.** 앱 진입 즉시 안내 화면이 뜨고 아무 데이터도 쓸 수 없어야 한다. → Task 3 SQL `banned_cannot_write`, Task 4 테스트 `routeFor banned` (최종 리뷰 보강: 마이그레이션 `20261022_002_hardening.sql` — 이름·연락처 수정, 서류 원본 삭제도 활성 계정만, 서류 등록은 사진 필수·가입 유형에 맞는 종류만 → `supabase/test/phase1_hardening_checks.sql`)
5. **관리자가 아닌 사람이 서류 확인 RPC를 호출.** 거부해야 한다. → Task 3 SQL `review_requires_admin`

---

## 파일 구조

```
aqua-job/
  app/
    layout.tsx                 HTML 셸, 폰트(Pretendard), 메타·manifest
    page.tsx                   AuthProvider > AppRouter
    globals.css                B안 CSS 변수
    manifest.ts                PWA 매니페스트
  components/
    app-router.tsx             역할·상태별 화면 분기
    intro/intro-slides.tsx     도입부 4장
    auth/login-form.tsx, signup-select.tsx, signup-form.tsx
    instructor/resume-wizard.tsx, resume-editor.tsx, instructor-shell.tsx
    center/center-profile-form.tsx, center-shell.tsx
    documents/document-list.tsx, document-upload-sheet.tsx, fact-badge.tsx
    admin/admin-shell.tsx, review-queue.tsx, review-detail.tsx
    shared/blocked-screen.tsx, step-question.tsx
    ui/                        shadcn
  lib/
    brand.ts
    supabase/client.ts, auth-provider.tsx, database.types.ts
    account/types.ts, logic.ts, logic.test.ts
    verification/types.ts, config.ts, logic.ts, logic.test.ts, api.ts
    instructor/types.ts, logic.ts, logic.test.ts, api.ts
    center/types.ts, api.ts
    image.ts                   (워너다이브에서 복사) 업로드 전 압축
  supabase/
    migrations/20261021_001_foundation.sql
    test/phase1_checks.sql
  docs/superpowers/specs/..., plans/...
```

---

### Task 0: 사용자 준비 (사람이 하는 일)

계정을 만들거나 로그인하는 일은 사용자가 직접 한다.

- [ ] GitHub `wannadive` 계정에 빈 저장소 `aqua-job`을 만든다(Private).
- [ ] Supabase에 새 프로젝트 `aqua-job`을 만든다(Region: Seoul). URL과 anon key, service role key를 확인한다.
- [ ] Authentication → Email: **Confirm email OFF**. 워너다이브 SETUP.md와 같은 이유로 바로 로그인되게 한다.
- [ ] 관리자로 쓸 이메일을 정한다. Task 3 시드에서 이 이메일을 `admin`으로 지정한다.

완료 조건: 저장소 주소, Supabase URL, 키 3개(anon, service role, 관리자 이메일)가 준비돼 있다. 키는 `.env.local`에만 넣고 채팅에 붙여 넣지 않는다.

---

### Task 1: 프로젝트 뼈대 + B안 테마 + PWA

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, `.gitignore`(`.env*`, `.superpowers/` 포함), `.env.local.example`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/manifest.ts`, `lib/brand.ts`, `lib/supabase/client.ts`, `lib/image.ts`, `components/ui/*`(button, input, label, textarea, switch, sheet, dialog, tabs, badge, select, checkbox)
- Create: `CLAUDE.md`(워너다이브 CLAUDE.md 형식으로 아쿠아잡 규칙 요약: 중립 원칙, 연락처/서류 경계, 모듈 구조)

**Interfaces:**
- Produces: `BRAND = { name: "아쿠아잡", nameEn: "AQUA JOB", appName: "AQUA JOB", tagline: "프리다이빙 강사·센터 연결" }`, `createClient()`(워너다이브와 동일 시그니처), `compressImage(file: File, maxEdge?: number): Promise<File>`(워너다이브 `lib/image.ts` 복사)
- 스크립트: `"test": "node --test \"lib/**/*.test.ts\""`, `dev`, `build`, `lint`

- [ ] **Step 1:** `C:\Users\USER\dev\aqua-job`에서 `git init`을 실행하고 `origin`을 Task 0 저장소로 지정한다. `git remote -v`로 주소가 `wannadive/aqua-job`인지 확인한다. 옆 폴더 저장소와 헷갈리지 않게 하기 위해서다.
- [ ] **Step 2:** 워너다이브 `package.json` 버전대로 의존성을 설치한다(Next·React·Supabase·radix·tailwind·sonner·zod·lucide·date-fns, `pnpm`).
- [ ] **Step 3:** `globals.css`에 B안 토큰을 CSS 변수로 정의한다(`--bg`, `--ink`, `--accent`, `--muted`, `--warn`, `--warn-bg`, `--ok`, `--ok-bg`). `tailwind.config.ts`에서 이 변수를 색 이름(`bg`, `ink`, `accent` …)으로 연결한다. 카드 radius는 `rounded-[18px]`이다.
- [ ] **Step 4:** `app/manifest.ts`를 만든다(name·short_name은 BRAND 값, theme_color `#0E2235`, background `#F4F8FB`, display standalone). 아이콘은 임시로 물결 SVG를 쓴다.
- [ ] **Step 5:** `pnpm build`를 실행한다. 기대 결과: 빌드 성공. `pnpm test`는 테스트 0개로 통과한다.
- [ ] **Step 6: Commit.** 설계 문서와 이 계획 문서도 함께 커밋한다.

```bash
git add -A && git commit -m "chore: 아쿠아잡 프로젝트 뼈대 + B안 테마 + PWA"
```

---

### Task 2: 서류 확인 도메인 로직 (`lib/verification`)

**Files:**
- Create: `lib/verification/types.ts`, `config.ts`, `logic.ts`, `logic.test.ts`

**Interfaces:**
- Produces:
  - `type DocType = "instructor_cert" | "liability_insurance" | "first_aid" | "id_card" | "business_registration" | "travel_business" | "representative_id" | "rep_instructor_cert"`
  - `type DocReviewStatus = "submitted" | "verified" | "rejected"`(DB에 저장되는 값)
  - `type DocDisplayStatus = "missing" | "submitted" | "verified" | "expiring" | "expired" | "rejected"`(화면용 계산 값)
  - `interface DocRecord { id: string; ownerId: string; docType: DocType; status: DocReviewStatus; validUntil: string | null /* YYYY-MM-DD */; meta: { org?: string; grade?: string; number?: string }; rejectReason: string | null; submittedAt: string; verifiedAt: string | null }`
  - `DOC_TYPES: Record<DocType, { label: string; owner: "instructor" | "center"; hasExpiry: boolean; deleteOriginalOnVerify: boolean; required: boolean; hint?: string }>`
  - `displayStatus(doc: DocRecord | undefined, today: string): DocDisplayStatus`
  - `latestByType(docs: DocRecord[]): Partial<Record<DocType, DocRecord>>`
  - `factLabel(doc: DocRecord, today: string): string`
  - `missingRequirements(verified: DocType[], required: DocType[]): DocType[]`
  - `EXPIRING_DAYS = 30`

`DOC_TYPES` 값(스펙 §7):

| DocType | label | owner | hasExpiry | deleteOriginalOnVerify | required |
|---|---|---|---|---|---|
| instructor_cert | 강사 자격증 | instructor | true | false | true |
| liability_insurance | 강사 배상책임보험 | instructor | true | false | true |
| first_aid | 응급처치·CPR | instructor | true | false | false |
| id_card | 신분증 | instructor | false | true | true |
| business_registration | 사업자등록증 | center | false | false | true |
| travel_business | 여행업 등록증 | center | false | false | false |
| representative_id | 대표자 신분증 | center | false | true | true |
| rep_instructor_cert | 대표강사 자격증 | center | true | false | false |

`id_card`와 `representative_id`의 hint: `"주민등록번호 뒷자리는 가리고 찍어 주세요. 확인이 끝나면 사진은 바로 삭제돼요."`

- [ ] **Step 1: 실패하는 테스트 작성** (`logic.test.ts`)

```ts
test("displayStatus 경계: 오늘 만료일은 유효, 어제는 만료, 30일 이내는 곧 만료", () => {
  const base = { id: "1", ownerId: "u", docType: "instructor_cert", status: "verified", meta: {}, rejectReason: null, submittedAt: "2026-01-01", verifiedAt: "2026-01-02" } as const;
  assert.equal(displayStatus({ ...base, validUntil: "2026-10-21" }, "2026-10-21"), "expiring");
  assert.equal(displayStatus({ ...base, validUntil: "2026-10-20" }, "2026-10-21"), "expired");
  assert.equal(displayStatus({ ...base, validUntil: "2026-11-20" }, "2026-10-21"), "expiring");
  assert.equal(displayStatus({ ...base, validUntil: "2026-11-21" }, "2026-10-21"), "verified");
  assert.equal(displayStatus({ ...base, docType: "id_card", validUntil: null }, "2030-01-01"), "verified");
  assert.equal(displayStatus(undefined, "2026-10-21"), "missing");
  assert.equal(displayStatus({ ...base, status: "submitted", validUntil: null }, "2026-10-21"), "submitted");
  assert.equal(displayStatus({ ...base, status: "rejected", validUntil: null }, "2026-10-21"), "rejected");
});

test("latestByType: 반려 후 재제출하면 최신 제출 건이 대표", () => {
  const r = latestByType([
    mk({ id: "a", docType: "instructor_cert", status: "rejected", submittedAt: "2026-10-01T00:00:00Z" }),
    mk({ id: "b", docType: "instructor_cert", status: "submitted", submittedAt: "2026-10-05T00:00:00Z" }),
  ]);
  assert.equal(r.instructor_cert?.id, "b");
});

test("factLabel: 사실만, 보증 표현 없음", () => {
  const d = mk({ docType: "instructor_cert", status: "verified", validUntil: "2027-03-31", meta: { org: "AIDA", grade: "강사" } });
  assert.equal(factLabel(d, "2026-10-21"), "AIDA 강사 자격증 · 2027.03까지");
  assert.equal(factLabel({ ...d, validUntil: "2026-10-01" }, "2026-10-21"), "AIDA 강사 자격증 · 만료됨");
  assert.equal(factLabel(mk({ docType: "id_card", status: "verified", validUntil: null }), "2026-10-21"), "신분증 · 확인됨");
  for (const s of [factLabel(d, "2026-10-21")]) assert.doesNotMatch(s, /검증|보증|인증됨|추천/);
});

test("missingRequirements: 확인된 서류에 없는 요건만", () => {
  assert.deepEqual(missingRequirements(["business_registration"], ["business_registration", "travel_business"]), ["travel_business"]);
  assert.deepEqual(missingRequirements([], []), []);
});
```

(`mk`는 테스트 파일 안의 `DocRecord` 기본값 헬퍼다.)

- [ ] **Step 2:** `pnpm test`를 실행한다. 기대 결과: 함수가 없어서 FAIL.
- [ ] **Step 3:** `types.ts`, `config.ts`(위 표), `logic.ts`를 구현한다. 날짜는 `YYYY-MM-DD` 문자열끼리 비교한다. 오늘(`today`)은 호출자가 KST 기준으로 넘기고, Date 시간대 변환은 하지 않는다. `factLabel` 앞부분은 meta의 org·grade가 있으면 `"{org} {grade} " + label`로 만들고(이때 grade의 "강사"와 label의 "강사"가 겹치지 않게 label에서 "강사 "를 뺀다 → "AIDA 강사 자격증"), 없으면 label만 쓴다.
- [ ] **Step 4:** `pnpm test`를 실행한다. 기대 결과: PASS.
- [ ] **Step 5: Commit** — `feat(verification): 서류 상태·사실 표시·요건 로직`

---

### Task 3: DB 기반 마이그레이션 + RLS + 서류 확인 RPC

**Files:**
- Create: `supabase/migrations/20261021_001_foundation.sql`, `supabase/test/phase1_checks.sql`, `lib/supabase/database.types.ts`

**Interfaces:**
- Produces (DB):
  - `profiles(id uuid pk → auth.users, role text check in ('instructor','center','admin'), display_name text not null, account_status text default 'active' check in ('active','suspended','banned'), center_id uuid null /* 핀프렌즈 대비, 지금은 null */, created_at, updated_at)`
  - `private_contacts(user_id uuid pk → profiles, phone text, email text)`
  - `instructor_profiles(user_id pk → profiles, gender text, age_band text, regions text[], photo_path text, mbti text, intro text, teaching_style_tags text[], teaching_style_note text, certifications jsonb /* [{org, level}] */, instructor_level text, instructor_years int, students_taught int, records jsonb /* {sta_sec, dyn_m, cwt_m, fim_m} */, past_centers text[], tour_experience text, languages text[], other_certs text[], available_days text[], available_time text, scopes text[] /* pool|sea|overseas_tour */, desired_rate text, is_public boolean default true, onboarding_done boolean default false, updated_at)`
  - `center_profiles(user_id pk → profiles, center_name text, representative_name text, head_instructor text, instructor_count int, instructor_names text[], monthly_students int, teaching_days text[], teaching_time text, venues text[], address text, photo_paths text[], updated_at)`
  - `documents(id uuid pk, owner_id → profiles, doc_type text, status text default 'submitted', file_path text null /* 신분증은 확인 후 null */, valid_until date null, meta jsonb default '{}', reject_reason text, submitted_at timestamptz default now(), reviewed_by uuid, verified_at timestamptz)`
  - `requirement_rules(action text, doc_type text, primary key(action, doc_type))`. 시드: `('post_lesson','business_registration'), ('post_affiliation','business_registration'), ('post_tour','business_registration'), ('post_tour','travel_business'), ('send_offer','business_registration')`
  - `admin_actions(id, admin_id, target_user_id, action text, reason text, created_at)`. 1단계에서는 서류 확인/반려만 기록한다.
  - 트리거 `handle_new_user()`: auth 가입 시 `raw_user_meta_data`의 role(instructor|center만 허용, 그 외 값은 거부), display_name, phone으로 profiles와 private_contacts를 만든다.
  - `is_admin() returns boolean`, `is_active() returns boolean`(본인 account_status = 'active')
  - RPC `review_document(p_doc_id uuid, p_decision text /* verified|rejected */, p_valid_until date, p_reason text) returns void`. SECURITY DEFINER, `is_admin()`이 아니면 예외. verified일 때 hasExpiry 서류는 `p_valid_until` 필수, rejected는 `p_reason` 필수. admin_actions에 기록한다.
  - RPC `has_requirements(p_user uuid, p_action text) returns boolean`. requirement_rules의 모든 doc_type에 대해 해당 사용자의 최신 verified 서류가 있고 만료되지 않았는지 본다. 2단계에서 쓴다.
  - Storage 버킷 `documents`(private). 경로 규칙은 `{owner_id}/{uuid}.{ext}`. 정책은 본인 insert/select/delete, 관리자 select/delete.
  - Storage 버킷 `avatars`(public read). 경로 규칙은 `{uid}/{uuid}.{ext}`. 쓰기와 삭제는 본인만 할 수 있다. 강사 프로필 사진과 센터 사진에 쓴다.
- RLS 요약:
  - `profiles`: 로그인 사용자 select. 본인 update(단 role·account_status 변경 불가 → 컬럼 수정은 트리거로 막음).
  - `private_contacts`: 본인·관리자 select. 본인 update.
  - `instructor_profiles` select: 본인, 관리자, 그리고 `is_public and` 조회자가 center 역할인 경우. 쓰기는 본인이면서 `is_active()`일 때.
  - `center_profiles` select: 로그인 사용자 전체. 쓰기는 본인이면서 active일 때.
  - `documents`: 본인·관리자 select. 본인이면서 active면 insert(status는 'submitted'로 강제). update는 RPC로만.

- [ ] **Step 1: 실패하는 SQL 검사 작성** (`phase1_checks.sql`). `begin; … rollback;` 안에서 테스트 사용자 3명(강사A, 강사B, 센터C)과 관리자를 만든다. `set local role authenticated; set local request.jwt.claims = '{"sub":"…"}'`로 사용자를 바꿔 가며 확인한다. 각 검사는 실패하면 `raise exception '<이름> 실패'`를 던진다.
  - `rls_contacts_hidden`: 강사B와 센터C로 강사A의 private_contacts를 select하면 0행.
  - `rls_documents_private`: 센터C가 강사A의 documents를 select하면 0행. storage.objects의 강사A 경로도 0행.
  - `review_requires_admin`: 강사B가 `review_document`를 호출하면 예외.
  - `resubmit_after_reject`: 관리자가 반려한 뒤 강사A가 같은 종류를 다시 insert하면 2행이 되고, 최신 행은 'submitted'.
  - `banned_cannot_write`: 강사A의 account_status를 'banned'로 바꾸면 instructor_profiles update가 0행 또는 거부.
  - `role_escalation_blocked`: 강사A가 자기 profiles.role을 'admin'으로 update하면 거부.
  - `signup_role_whitelist`: meta role='admin'으로 가입하면 예외.
  - `has_requirements_tour`: 센터C가 business_registration만 verified일 때 `post_tour`는 false, travel_business까지 verified면 true.
- [ ] **Step 2:** 사용자에게 Supabase SQL Editor에서 `phase1_checks.sql`을 실행해 달라고 한다(또는 연결된 CLI로 실행한다). 기대 결과: 테이블이 없어서 실패.
- [ ] **Step 3:** `20261021_001_foundation.sql`을 작성한다. 위 테이블·트리거·함수·RLS·버킷 정책을 넣고, 관리자 이메일 지정 구문(`update profiles set role='admin' where id = (select id from auth.users where email = :'admin_email')`)은 주석으로 안내한다.
- [ ] **Step 4:** 마이그레이션을 적용한 뒤 `phase1_checks.sql`을 실행한다. 기대 결과: 예외 없이 끝나고 마지막 `select 'phase1 ok'`가 출력된다.
- [ ] **Step 5:** `database.types.ts`를 손으로 작성한다(워너다이브 방식). 위 테이블 Row/Insert/Update 타입이다.
- [ ] **Step 6: Commit** — `feat(db): 기반 스키마·RLS·서류 확인 RPC·요건 규칙표`

---

### Task 4: 인증 + 역할별 화면 분기

**Files:**
- Create: `lib/supabase/auth-provider.tsx`, `lib/account/types.ts`, `lib/account/logic.ts`, `lib/account/logic.test.ts`, `components/app-router.tsx`, `components/auth/login-form.tsx`, `components/auth/signup-select.tsx`, `components/auth/signup-form.tsx`, `components/shared/blocked-screen.tsx`

**Interfaces:**
- Consumes: `createClient()`(Task 1), profiles·private_contacts(Task 3)
- Produces:
  - `useAuth(): { user: Account | null; isLoading: boolean; login(email, pw): Promise<{error?: string}>; signup(input: SignupInput): Promise<{error?: string}>; logout(): Promise<void>; refreshAccount(): Promise<void> }`
  - `interface Account { id: string; role: "instructor" | "center" | "admin"; displayName: string; accountStatus: "active" | "suspended" | "banned"; onboardingDone: boolean }`
  - `interface SignupInput { role: "instructor" | "center"; email: string; password: string; displayName: string; phone: string }`
  - `routeFor(account: Account | null, introSeen: boolean): "intro" | "login" | "blocked" | "instructor-onboarding" | "instructor" | "center" | "admin"`

- [ ] **Step 1: 실패하는 테스트 작성** (`lib/account/logic.test.ts`)

```ts
test("routeFor", () => {
  const a = (o: Partial<Account>): Account => ({ id: "u", role: "instructor", displayName: "x", accountStatus: "active", onboardingDone: true, ...o });
  assert.equal(routeFor(null, false), "intro");
  assert.equal(routeFor(null, true), "login");
  assert.equal(routeFor(a({ accountStatus: "banned" }), true), "blocked");
  assert.equal(routeFor(a({ accountStatus: "suspended", role: "center" }), true), "blocked");
  assert.equal(routeFor(a({ onboardingDone: false }), true), "instructor-onboarding");
  assert.equal(routeFor(a({ role: "center", onboardingDone: false }), true), "center");
  assert.equal(routeFor(a({ role: "admin" }), true), "admin");
});
```

- [ ] **Step 2:** `pnpm test`를 실행한다. 기대 결과: FAIL.
- [ ] **Step 3:** `routeFor`를 구현한다. `auth-provider.tsx`는 워너다이브 `lib/supabase/auth-provider.tsx`의 세션 복원 방식을 따른다(`onAuthStateChange` INITIAL_SESSION + 3초 timeout fallback). 가입은 `supabase.auth.signUp({ email, password, options: { data: { role, display_name, phone } } })`로 한다. "도입부 봤음" 여부는 localStorage `aqua.introSeen`에 저장하고, 읽기·쓰기는 try/catch로 감싼다.
- [ ] **Step 4:** 화면을 만든다.
  - `signup-select`: v0 문구 "강사 회원가입 · 공고를 찾고 센터에 지원하세요" / "센터 회원가입 · 강사를 찾고 공고를 등록하세요"
  - `signup-form`: 이름(센터는 센터명)·이메일·휴대폰·비밀번호·약관 동의(필수). 서류 업로드는 여기서 받지 않는다(가입 후 바로 이용, 스펙 §9-2).
  - `blocked-screen`: "이용이 제한된 계정이에요" + 사유는 3단계에서 붙인다 + 로그아웃 버튼
  - 관리자 로그인 화면은 `/admin` 주소로만 들어간다. 도입부 선택지에는 넣지 않는다.
- [ ] **Step 5:** `pnpm test && pnpm build`를 실행한다. 기대 결과: PASS, 빌드 성공.
- [ ] **Step 6:** 로컬 dev에서 강사·센터 테스트 계정을 하나씩 가입해 보고 역할별 빈 홈까지 들어가는지 확인한다. 테스트 계정 정보는 `supabase/test/README.md`에 적는다.
- [ ] **Step 7: Commit** — `feat(auth): 가입·로그인·역할 분기·정지 계정 차단`

---

### Task 5: 도입부 슬라이드 (v0 인용)

**Files:**
- Create: `components/intro/intro-slides.tsx`

**Interfaces:**
- Consumes: `routeFor`의 `"intro"` / `"login"`, BRAND
- Produces: `<IntroSlides onFinish={(choice: "instructor" | "center" | "signup") => void} />`

문구(스펙 §9-1, 그대로):
1. `지인 강습만 하시기엔\n아쉬우시죠?` / `더 많은 기회를 찾아보세요.\nAQUA JOB이 도와드립니다.`
2. `프리랜서 프리다이빙 강사로\n경력을 확장하세요` / `다양한 센터의 공고를 한눈에.\n원하는 조건으로 일하세요.`
3. `센터 운영, 강사 섭외에서부터\n고민되시나요?` / `실제 활동 중인 강사를 빠르게 찾고\n직접 제안까지 보낼 수 있어요.`
4. `AQUA JOB` / `시작하기`. 선택지: `강사 로그인 · 공고 찾기 및 지원`, `센터 로그인 · 강사 섭외 및 공고 등록`, `아직 계정이 없으신가요? 회원가입하기`, `이용약관 · 개인정보처리방침`

- [ ] **Step 1:** 슬라이드를 구현한다. 가로 스와이프(터치)와 하단 점 표시, 이전(<) 버튼, 다음(>) 버튼을 넣고, 4번째 장에서는 버튼을 "시작하기"로 바꾼다. 맨 위에는 물결 아이콘(lucide `Waves`, 포인트 색)을 둔다. 스와이프는 CSS scroll-snap으로 구현해 iOS WebKit에서도 그대로 동작하게 한다.
- [ ] **Step 2:** 브라우저 프리뷰를 모바일 크기(375×812)로 띄워 네 장을 스와이프하고 버튼으로도 넘겨본다. 각 장을 스크린샷으로 확인한다. 기대 결과: 문구가 위와 글자 하나까지 같아야 한다.
- [ ] **Step 3: Commit** — `feat(intro): v0 도입부 슬라이드 4장 (프리다이빙 문구)`

---

### Task 6: 강사 이력서 — 질문 하나씩 가입 + 이력서 수정

**Files:**
- Create: `lib/instructor/types.ts`, `logic.ts`, `logic.test.ts`, `api.ts`, `components/shared/step-question.tsx`, `components/instructor/resume-wizard.tsx`, `resume-editor.tsx`, `instructor-shell.tsx`

**Interfaces:**
- Consumes: instructor_profiles(Task 3), `useAuth().refreshAccount`
- Produces:
  - `interface InstructorProfile`(Task 3 컬럼을 camelCase로)
  - `RESUME_STEPS: { key: keyof InstructorProfile | "records"; title: string; help?: string; kind: "single" | "multi" | "text" | "number" | "records" | "photo" }[]`
  - `formatRecords(r: {staSec?: number; dynM?: number; cwtM?: number; fimM?: number}): { label: "STA" | "DYN" | "CWT" | "FIM"; value: string }[]`(값이 있는 것만, 이 순서로)
  - `parseStaInput(s: string): number | null`(`"5:12"` → 312, `"312"` → 312, 잘못된 값 → null)
  - `resumeCompleteness(p: InstructorProfile): { done: number; total: number; missing: string[] }`
  - `fetchMyInstructorProfile()`, `saveInstructorProfile(patch: Partial<InstructorProfile>): Promise<{ error?: string }>`
  - `<StepQuestion title help progress onNext onBack>`(가입 화면 공용 레이아웃, 진행 막대 + 큰 제목 + 하단 "다음" 버튼)

질문 순서(한 화면에 하나): 성별 → 나이대 → 활동 지역(복수) → 주로 교육하는 곳(풀·바다·해외 투어, 복수) → 자격 단체·등급 → 강사 경력 연수 → 개인 기록(STA·DYN·CWT·FIM, 건너뛰기 가능) → MBTI → 수업 스타일 꼬리표 → 자기소개 → 가능 요일·시간대 → 희망 단가(선택) → 프로필 사진. 각 화면에 "나중에 할게요"를 둔다. 마지막 화면 끝에서 `onboarding_done = true`로 바꾼다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test("formatRecords 순서 STA→DYN→CWT→FIM, 빈 값 제외", () => {
  assert.deepEqual(formatRecords({ cwtM: 42, staSec: 312, fimM: undefined, dynM: 150 }),
    [{ label: "STA", value: "5:12" }, { label: "DYN", value: "150m" }, { label: "CWT", value: "42m" }]);
});
test("parseStaInput", () => {
  assert.equal(parseStaInput("5:12"), 312);
  assert.equal(parseStaInput("312"), 312);
  assert.equal(parseStaInput("5:75"), null);
  assert.equal(parseStaInput(""), null);
});
test("resumeCompleteness: 필수 항목만 센다", () => {
  const r = resumeCompleteness({ gender: "여", regions: [], certifications: [] } as any);
  assert.ok(r.missing.includes("활동 지역"));
});
```

- [ ] **Step 2:** `pnpm test`를 실행한다. 기대 결과: FAIL.
- [ ] **Step 3:** 로직과 api를 구현한다(supabase `.from("instructor_profiles").upsert(... as any)`). 사진은 `compressImage`로 줄인 뒤 `avatars` 버킷(Task 3)에 올린다.
- [ ] **Step 4:** 마법사와 수정 화면을 만든다. 수정 화면은 같은 항목을 섹션 카드로 보여준다: 기본 / 성향 / 프리다이빙 스펙 / 이력 / 가능 조건 / 공개 설정("센터에 내 프로필 공개" 스위치). 연락처(휴대폰·이메일)는 `private_contacts`에서 읽고 쓰며, 옆에 "선택된 센터에만 보여요" 안내를 붙인다.
- [ ] **Step 5:** 강사 셸을 만든다. 하단 탭은 홈 / 공고 / 제안 / 지원 현황 / 내 이력서이고, 1단계에서는 공고·제안·지원 현황 탭에 "곧 열려요" 빈 화면을 둔다. 홈에는 인사와 이력서 완성도, 서류 상태 요약을 보여준다.
- [ ] **Step 6:** `pnpm test && pnpm build`를 실행하고, 프리뷰에서 강사 계정으로 마법사를 처음부터 끝까지 진행한 뒤 수정 화면에 값이 남는지 확인한다.
- [ ] **Step 7: Commit** — `feat(instructor): 질문형 이력서 작성·수정·공개 스위치`

---

### Task 7: 센터 프로필

**Files:**
- Create: `lib/center/types.ts`, `lib/center/api.ts`, `components/center/center-profile-form.tsx`, `components/center/center-shell.tsx`

**Interfaces:**
- Consumes: center_profiles(Task 3), `missingRequirements`·`DOC_TYPES`(Task 2), `documents` 조회(Task 8의 `fetchMyDocuments`, 이 Task에서는 빈 배열로 시작)
- Produces: `interface CenterProfile`, `fetchMyCenterProfile()`, `saveCenterProfile(patch): Promise<{ error?: string }>`

- [ ] **Step 1:** 폼을 만든다. 항목(스펙 §6)은 센터명, 대표자, 대표강사, 소속강사 수와 명단(글자), 월 교육생 수(본인 입력 표시), 교육 요일과 시간대, 주 교육 장소(복수), 사업장 주소, 사진(최대 5장, `avatars` 버킷)이다.
- [ ] **Step 2:** 센터 셸을 만든다. 하단 탭은 홈 / 공고 / 지원자 / 강사 찾기 / 설정이고, 1단계에서는 공고·지원자·강사 찾기에 "곧 열려요" 빈 화면을 둔다. 홈은 v0 구성(현황 숫자 3개는 0, 빠른 메뉴)을 따르고, 사업자등록증이 확인 전이면 맨 위에 안내 카드를 띄운다: `사업자등록증이 확인되면 공고를 올리고 강사에게 제안할 수 있어요` + "서류 제출하기" 버튼.
- [ ] **Step 3:** `pnpm build`를 실행하고, 프리뷰에서 센터 계정으로 저장한 뒤 다시 열어 값이 남는지 확인한다.
- [ ] **Step 4: Commit** — `feat(center): 센터 프로필·센터 홈 안내 카드`

---

### Task 8: 서류 제출 화면 (강사·센터 공용)

**Files:**
- Create: `lib/verification/api.ts`, `components/documents/document-list.tsx`, `document-upload-sheet.tsx`, `fact-badge.tsx`

**Interfaces:**
- Consumes: `DOC_TYPES`, `latestByType`, `displayStatus`, `factLabel`(Task 2), documents·버킷(Task 3), `compressImage`
- Produces:
  - `fetchMyDocuments(): Promise<DocRecord[]>`
  - `submitDocument(input: { docType: DocType; file: File; meta?: DocRecord["meta"] }): Promise<{ error?: string }>`(Storage에 올린 뒤 insert한다. insert가 실패하면 올린 파일을 지운다)
  - `<FactBadge doc today />`: 상태별 색(확인됨 민트, 곧 만료·만료 앰버, 반려 빨강 계열, 확인 대기 회색) + `factLabel`
  - `<DocumentList owner="instructor" | "center" />`

- [ ] **Step 1:** 목록을 구현한다. 내 역할의 `DOC_TYPES`를 순서대로 보여준다. 행마다 상태 꼬리표를 붙이고, 반려면 사유를, 만료·곧 만료면 "다시 올리기"를 띄운다. v0 "자격증 및 서류" 구성(등록됨·파일명·재업로드)을 따른다.
- [ ] **Step 2:** 업로드 시트를 구현한다. 카메라 또는 사진 선택 → 압축 → 미리보기 → 자격증이면 단체·등급·번호 입력 → 제출. 신분증 종류에는 hint 문구를 크게 보여준다.
- [ ] **Step 3:** 강사 "내 이력서" 탭과 센터 "설정" 탭에 서류 섹션을 붙이고, 센터 홈 안내 카드의 버튼을 이 화면에 연결한다.
- [ ] **Step 4:** 프리뷰에서 강사 계정으로 자격증과 신분증을 올리고 "확인 대기"로 보이는지 확인한다. 이어서 센터 계정의 Storage 경로로 강사 파일을 읽으려 하면 실패하는지 콘솔에서 확인한다.
- [ ] **Step 5: Commit** — `feat(documents): 서류 제출·상태 꼬리표`

---

### Task 9: 관리자 서류 확인

**Files:**
- Create: `components/admin/admin-shell.tsx`, `review-queue.tsx`, `review-detail.tsx`, `app/api/admin/purge-original/route.ts`, `lib/supabase/admin.ts`(service role 서버 전용)

**Interfaces:**
- Consumes: `review_document` RPC(Task 3), `DOC_TYPES.deleteOriginalOnVerify`(Task 2)
- Produces:
  - `fetchReviewQueue(): Promise<(DocRecord & { ownerName: string; ownerRole: "instructor" | "center" })[]>`(status='submitted', 오래된 순)
  - `reviewDocument(input: { docId: string; decision: "verified" | "rejected"; validUntil?: string; reason?: string }): Promise<{ error?: string }>`. RPC를 호출하고, verified이면서 `deleteOriginalOnVerify`면 `POST /api/admin/purge-original { docId }`도 호출한다.
  - `POST /api/admin/purge-original`: 요청자의 JWT로 관리자 여부를 확인한 뒤, service role로 Storage 객체를 지우고 `documents.file_path = null`로 만든다.
  - (최종 리뷰 보강) 신분증은 반려해도 원본을 바로 지운다. 같은 사람이 같은 종류를 다시 올려 밀려난 "확인 대기" 신분증도 지운다(밀려났는지는 API가 DB를 보고 판단). `fetchPendingPurges`는 확인·반려됐거나 밀려났는데 원본이 남은 신분증을 모두 보여 주고, 관리자 목록을 열 때마다 자동으로 다시 지운다. `SUPABASE_SERVICE_ROLE_KEY`가 없으면 API는 `service role not configured`를 로그에 남기고 500.

- [ ] **Step 1:** 관리자 셸을 만든다. 탭은 서류 확인 / 회원(1단계는 목록만) / 설정이다. 카드 구성은 v0 "가입 승인 관리"를 따른다: 이름·유형·서류 종류·제출일.
- [ ] **Step 2:** 상세 화면을 만든다. 서류 이미지는 signed URL(60초)로 보여준다. 자격증이면 단체·등급·번호를 보여주고 고칠 수 있게 하며, 유효기간 날짜를 입력받는다. 버튼은 [확인] / [반려 → 사유 입력(필수)]이고, 반려 사유는 빠른 선택(사진 흐림, 이름 불일치, 기간 만료, 다른 서류) + 자유 입력이다.
- [ ] **Step 3:** 프리뷰에서 시험한다. 관리자 계정으로 Task 8에서 올린 신분증을 확인한다. 기대 결과: 강사 화면에 `신분증 · 확인됨`이 보이고, Storage에서 원본 파일이 사라지고, documents.file_path가 null이다. 자격증은 유효기간을 넣고 확인한다. 기대 결과: `AIDA 강사 자격증 · 2027.03까지`. 다른 서류 하나는 반려한다. 기대 결과: 강사 화면에 사유가 보이고, 다시 올리면 대기열에 새로 뜬다.
- [ ] **Step 4:** 강사 계정 토큰으로 `/api/admin/purge-original`을 호출한다. 기대 결과: 403.
- [ ] **Step 5: Commit** — `feat(admin): 서류 확인·반려·신분증 원본 삭제`

---

### Task 10: 배포

- [ ] **Step 1:** `git push -u origin main`을 실행한다. 푸시 전에 `git remote -v`로 `wannadive/aqua-job`인지 다시 확인한다.
- [ ] **Step 2:** 사용자가 Vercel(wannadive 팀)에서 이 저장소를 import하고 환경 변수 3개(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)를 넣는다.
- [ ] **Step 3:** 배포 주소에서 확인한다. 도입부 → 가입 → 이력서 → 서류 제출 → 관리자 확인 흐름을 모바일 크기로 한 번 끝까지 진행한다. 결과는 스크린샷으로 남긴다.
- [ ] **Step 4:** `docs/RELEASE_NOTES.md`에 v0.1.0 항목을 쓰고 `package.json` 버전을 `0.1.0`으로 맞춘 뒤 커밋·푸시한다.

---

## Self-Review 메모

- 스펙 커버리지(1단계 범위):
  - §5 이력서 → Task 6
  - §6 센터 → Task 7
  - §7 서류(유효기간·만료 표시·원본 범위·신분증 삭제·센터 요건 규칙표) → Task 2·3·8·9
  - §7-1 퇴출은 3단계로 미룬다. 단 `account_status`와 차단 화면은 1단계에서 미리 만든다(Task 3·4).
  - §9-1 도입부 → Task 5
  - §9-2 v0 대조(가입 흐름·센터 홈·관리자 카드) → Task 4·7·9
  - §10 디자인 → Task 1
  - §11 스택·연락처 경계 → Task 1·3
  - §8·§8-1·§8-2·§8-3·§4는 2단계, 제안·알림·신고는 3단계에서 다룬다.
- 만료 30일 전과 만료일 알림은 3단계(알림)에서 다룬다. 1단계는 화면 표시까지만 한다.
