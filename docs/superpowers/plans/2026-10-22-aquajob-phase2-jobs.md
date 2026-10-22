# 아쿠아잡 2단계(공고·지원·선택) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 센터가 공고(수업 단위·소속 계약·투어 동행)를 올리고, 누구나 공고 목록·요약을 보고(발레매니아식 잠금), 강사가 지원하고, 센터가 지원자를 선택하면 그 센터에만 연락처가 열리는 흐름을 배포한다.

**Architecture:** 1단계와 같은 구성(Next.js App Router + Supabase RLS/RPC, `lib/<도메인>/` 모듈). 공고 쓰기·지원·선택·조회수·연락처 열람은 전부 SECURITY DEFINER RPC로 하고 테이블 직접 쓰기는 막는다. 공개(로그인 전) 화면은 요약 전용 뷰만 읽는다. 공고 상태(마감)는 저장값 + 읽을 때 계산(마감일·수업일·인원)으로 정한다.

**Tech Stack:** 1단계와 동일 (Next.js 16.1.6, React 19, TS, Tailwind, shadcn/ui, supabase-js, node:test, pnpm via `npx pnpm@9`)

**Spec:** `docs/superpowers/specs/2026-10-21-aquajob-design.md` (§2, §4, §4-1, §6, §7, §8, §8-1~8-3, §9-2, §11-1)

**1단계에서 넘어온 것:** `.superpowers/sdd/2026-10-21-aquajob-phase1-foundation/progress.md`의 "2단계 시작 전" 항목 2개(Task 1)와 deferred minor 목록.

**범위 밖(3단계):** 강사 둘러보기·제안, 알림·웹푸시(이번 단계의 "알림"은 앱 안 상태 표시로 대신), 신고·숨김·정지·퇴출, 유료 결제. 유료 관문 스위치 자리는 이번에 만든다.

## Global Constraints

- 1단계 Global Constraints 전부 유지 (`.superpowers/sdd/2026-10-21-aquajob-phase1-foundation/global-constraints.md`): 한국어, 중립 문구(검증·보증·추천·인증됨 금지), B안 토큰, STA→DYN→CWT→FIM, BRAND는 `lib/brand.ts`, `createClient` 규칙, mutation await + toast, 멀티 롤(roles), 연락처는 `private_contacts`, 서류 원본 비공개.
- 연락처가 열리는 경로는 **선택**(이번 단계)과 **제안 수락**(3단계) 둘뿐이다. 그 외 어떤 화면·쿼리·RPC도 남의 연락처를 돌려주지 않는다.
- 공고 상세 하단 고지문(그대로): `본 정보는 {센터명}에서 제공한 자료이며, 아쿠아잡은 기재 내용에 대해 보증하지 않습니다.`
- 단가 미입력은 `협의`로 표시.
- 공고 카드·상세에 `M/D 등록 · 조회 N` 표시, 수정했으면 `M/D 수정됨` 추가. 등록일은 수정해도 바뀌지 않는다.
- 조회수: 같은 사람(로그인 id) 또는 같은 기기(비로그인 기기 키)는 KST 하루 1회, 공고 주인 센터는 세지 않음.
- 잠금 표시: 자리는 보이고 내용은 가림 + 앰버 꼬리표 `가입하고 보기`(비로그인) / `구독하고 보기`(유료 전환 후 비구독). 무료 기간(`paid_mode=false`)에는 로그인한 모든 회원에게 상세 공개.
- 공고 종류별 필요 서류는 `requirement_rules`(post_lesson / post_affiliation / post_tour)만 본다. 하드코딩 금지.
- 날짜 계산은 KST(`todayKst`). 모바일 웹 기준(iOS Safari·Chrome).

## Review Focus

1. **비로그인·다른 강사·다른 센터가 지원자 연락처를 얻으려는 모든 경로** — 선택되지 않은 지원자, 남의 공고 지원자, 비로그인 모두 빈 결과/거부. → Task 2 SQL `contact_only_for_selected_own_job`, `anon_cannot_read_applications`
2. **모집 인원이 찬 공고에 동시에 두 번 선택** — 인원 초과 선택이 생기면 안 된다. → Task 2 SQL `select_respects_headcount`(FOR UPDATE), Task 3 `remainingSlots` 테스트
3. **마감일·수업일 경계(KST 자정)** — 마감일 당일은 모집 중, 다음 날 0시(KST)부터 마감. → Task 3 `jobDisplayStatus 경계` 테스트, Task 2 SQL `effective_status_deadline`
4. **서류 요건이 안 되는 센터가 API로 공고를 만드는 시도** (투어인데 여행업 없음 등) → Task 2 SQL `post_tour_requires_travel_business`
5. **정지·퇴출 계정의 지원·공고·선택 시도** → Task 2 SQL `banned_cannot_apply_or_post`

---

## 파일 구조

```
supabase/migrations/
  20261023_004_pre_phase2.sql      profiles 노출 축소 + 유효 서류 규칙 통일
  20261023_005_jobs.sql            공고·지원·조회·설정 테이블, 뷰, RPC, RLS
supabase/test/
  phase2_pre_checks.sql, phase2_jobs_checks.sql
lib/verification/effective.ts (+test)   "유효 서류" 규칙 (SQL과 같은 규칙)
lib/jobs/
  types.ts config.ts logic.ts (+test) mappers.ts (+test) api.ts
lib/device-key.ts                  비로그인 조회수용 기기 키
lib/settings/api.ts                paid_mode 읽기
app/jobs/page.tsx, app/jobs/[id]/page.tsx, app/centers/[id]/page.tsx   공개 화면
components/jobs/
  job-card.tsx job-list.tsx job-filters.tsx job-detail.tsx locked-field.tsx
  job-form.tsx (center) my-jobs.tsx (center) apply-sheet.tsx (instructor)
  my-applications.tsx (instructor) applicants.tsx (center) applicant-resume.tsx (center)
components/centers/center-public-profile.tsx
components/admin/admin-jobs.tsx
```

---

### Task 1: 2단계 전 정비 — 이름 노출 축소 + "유효 서류" 규칙 하나로

**Files:**
- Create: `supabase/migrations/20261023_004_pre_phase2.sql`, `supabase/test/phase2_pre_checks.sql`, `lib/verification/effective.ts`, `lib/verification/effective.test.ts`
- Modify: `supabase/test/README.md`(실행 순서), 서류 꼬리표를 남에게 보여줄 곳에서 쓸 헬퍼 export

**Interfaces:**
- Produces:
  - SQL `public.effective_doc(p_user uuid, p_doc_type text) returns public.documents` — 그 사용자·종류의 **확인된(verified) 서류 중 가장 최근 확인 건**이고 유효기간이 오늘(KST) 이상이거나 없는 것. 없으면 null.
  - `has_requirements`가 위 `effective_doc`를 쓰도록 재정의 (004에서 `create or replace`, 001 정의를 복사하지 말고 최신 정의를 기준으로).
  - TS `effectiveDoc(docs: DocRecord[], type: DocType, today: string): DocRecord | undefined` — SQL과 같은 규칙 (verified만, verifiedAt 최신, 만료 제외, `곧 만료`는 유효).
  - TS `publicFacts(docs: DocRecord[], today: string): { type: DocType; label: string; tone: "ok" | "warn" }[]` — 남에게 보여줄 사실 꼬리표(유효 서류만, `factLabel` 재사용). 반려·대기·만료는 남에게 보이지 않는다.
  - 본인 화면은 지금처럼 `latestByType`(최신 제출) 유지 — "내가 낸 것의 진행 상태"와 "남에게 보이는 사실"을 구분.
  - profiles select 정책 축소: `can_view_profile(target uuid) returns boolean` (SECURITY DEFINER) — 본인, 관리자, 대상이 센터 역할, 보는 사람이 센터이고 대상의 `instructor_profiles.is_public`, 또는 (Task 2 이후) 보는 센터의 공고에 지원한 강사. 004에서는 앞의 네 조건만, 지원 조건은 005에서 함수 재정의로 추가.

- [ ] **Step 1: 실패하는 테스트** (`effective.test.ts`)

```ts
test("effectiveDoc: 확인된 것 중 최신, 만료 제외, 대기/반려 무시", () => {
  const today = "2026-10-23";
  const docs = [
    mk({ id: "old", docType: "instructor_cert", status: "verified", verifiedAt: "2026-01-01T00:00:00Z", validUntil: "2027-01-01" }),
    mk({ id: "new", docType: "instructor_cert", status: "submitted", submittedAt: "2026-10-20T00:00:00Z" }),
  ];
  assert.equal(effectiveDoc(docs, "instructor_cert", today)?.id, "old");
  assert.equal(effectiveDoc([mk({ status: "verified", validUntil: "2026-10-22", verifiedAt: "2026-01-01T00:00:00Z" })], "instructor_cert", today), undefined);
  assert.equal(effectiveDoc([mk({ status: "verified", validUntil: "2026-10-23", verifiedAt: "2026-01-01T00:00:00Z" })], "instructor_cert", today)?.status, "verified");
});
test("publicFacts: 남에게는 유효 서류만, 금지어 없음", () => {
  const f = publicFacts([mk({ docType: "id_card", status: "rejected" }), mk({ docType: "liability_insurance", status: "verified", validUntil: "2026-11-01", verifiedAt: "2026-01-01T00:00:00Z" })], "2026-10-23");
  assert.deepEqual(f.map(x => [x.type, x.tone]), [["liability_insurance", "warn"]]);
  for (const x of f) assert.doesNotMatch(x.label, /검증|보증|인증됨|추천/);
});
```

- [ ] **Step 2:** `npx pnpm@9 test` → FAIL.
- [ ] **Step 3:** `effective.ts` 구현, 004 SQL 작성(idempotent, 001~003 적용된 운영 DB 위에서 실행), `phase2_pre_checks.sql`(begin…rollback, `raise '<이름> 실패'`, 끝에 `select 'pre2 ok'`): `instructor_cannot_list_other_instructors`, `center_sees_public_instructor_name`, `center_cannot_see_private_instructor_name`, `has_requirements_uses_latest_verified`(새로 낸 서류가 대기 중이어도 이전 확인 건이 유효하면 true, 반려돼도 true, 만료면 false), `everyone_sees_center_name`.
- [ ] **Step 4:** test/typecheck/build 통과. SQL은 사용자가 실행(README 순서 갱신).
- [ ] **Step 5: Commit** — `fix(db): 2단계 전 정비 — 회원 이름 노출 축소·유효 서류 규칙 통일` (+ 스펙 §7에 "남에게 보이는 사실 = 유효 서류(확인·미만료), 본인 화면 = 최신 제출 상태" 한 줄)

---

### Task 2: 공고 DB — 테이블·뷰·RPC·RLS·점검

**Files:**
- Create: `supabase/migrations/20261023_005_jobs.sql`, `supabase/test/phase2_jobs_checks.sql`
- Modify: `lib/supabase/database.types.ts`, `supabase/test/README.md`

**Interfaces (DB):**
- `app_settings(key text pk, value jsonb)` — 시드 `('paid_mode', 'false')`. select: 누구나(anon 포함). 쓰기: 관리자만.
- `job_posts`:
  - `id uuid pk`, `owner_id uuid → profiles` (센터 계정), `center_id uuid null`(핀프렌즈 대비, 지금 null)
  - `job_type text check in ('lesson','affiliation','tour')`
  - `title text not null (2~60자)`, `region text not null`, `venue text`
  - 수업: `class_date date`, `start_time time`, `end_time time`
  - 소속: `work_days text[]`, `work_time text`
  - 투어: `tour_start date`, `tour_end date`, `destination text`, `destination_kind text check in ('domestic','overseas')`, `covers_flight bool`, `covers_lodging bool`
  - 단가: `pay_amount int null (>0)`, `pay_unit text check in ('per_class','per_hour','per_day','per_month','total') null` — 둘 다 null이면 협의
  - `headcount int not null check 1..20`, `requirement_tags text[] default '{}'`, `description text not null`, `deadline date not null`
  - `status text default 'open' check in ('open','closed','hidden')`, `closed_reason text check in ('manual','full','expired') null`
  - `view_count int default 0`, `created_at`, `edited_at timestamptz null`
- `job_applications(id, job_id → job_posts, instructor_id → profiles, message text (≤200), status text default 'applied' check in ('applied','selected','withdrawn','not_selected'), created_at, decided_at)`, `unique(job_id, instructor_id)`
- `job_views(job_id, viewer_key text, view_day date, primary key(job_id, viewer_key, view_day))` — 직접 접근 불가, RPC로만.
- 함수:
  - `job_effective_status(j job_posts) returns text` — hidden > closed > (오늘 KST > deadline 또는 수업일/투어 시작일 지남 → 'expired') > (선택 수 ≥ headcount → 'full') > 'open'
  - 뷰 `public_job_summaries` (security_invoker=false 아님 — 요약 컬럼만 노출하는 `security definer` 함수 `list_public_jobs(p_type text, p_region text, p_paid_only bool, p_limit int, p_offset int)`로 제공): id, job_type, title, region, venue, 일정 필드, 단가, headcount, 남은 인원, requirement_tags, deadline, 센터명(center_profiles.center_name), owner_id, view_count, created_at, edited_at, effective_status. **description·센터 상세는 제외.** hidden 제외. anon·authenticated 실행 가능.
  - `get_job_summary(p_job uuid)` — 위와 같은 요약 1건(anon 가능).
  - `get_job_detail(p_job uuid)` — description + 센터 공개 프로필 요약 포함. 로그인 + `can_view_job_detail()` 필요(`paid_mode=false`면 로그인한 모든 활성 회원 true; 유료 전환 후 구독 테이블은 3단계 — 지금은 `paid_mode=true`면 관리자·공고 주인만 true로 자리만).
  - `create_job_post(payload jsonb) returns uuid` — 호출자 center 역할·활성, `has_requirements(auth.uid(), 'post_'||job_type)` 아니면 42501, 필드 검증(종류별 필수: lesson=class_date, tour=tour_start/end+destination), deadline ≥ 오늘, tour_end ≥ tour_start.
  - `update_job_post(p_job uuid, payload jsonb)` — 주인만, open일 때만, `edited_at = now()`, created_at 불변, headcount는 이미 선택 수보다 작게 못 줄임.
  - `close_job_post(p_job uuid)` — 주인 → status closed, reason manual; 남은 applied 지원은 not_selected.
  - `apply_to_job(p_job uuid, p_message text) returns uuid` — 호출자 instructor 역할·활성, 공고 effective open, 본인 공고 아님, 중복 시 기존 withdrawn이면 applied로 되살림, `can_view_job_detail()` 필요.
  - `withdraw_application(p_app uuid)` — 본인, applied일 때만.
  - `select_applicant(p_app uuid)` — 공고 주인만, 공고 행 `FOR UPDATE`, effective open, 선택 수 < headcount, applied일 때만 → selected, decided_at. 선택 후 인원이 차면 공고 status closed / reason full, 남은 applied는 not_selected.
  - `get_applicant_contact(p_app uuid) returns table(phone text, email text)` — 공고 주인이고 지원 status = selected일 때만, 그 외 빈 결과.
  - `record_job_view(p_job uuid, p_device_key text)` — viewer_key = 로그인 시 auth.uid()::text, 아니면 `'d:'||p_device_key`(형식 검증: 16~64자 [A-Za-z0-9_-]); 공고 주인이면 무시; `insert … on conflict do nothing` 성공 시에만 view_count+1. anon 실행 가능.
  - `expire_jobs()` — 마감 지난 open 공고를 closed/expired로 바꾸고 남은 applied는 not_selected. list/detail RPC 앞에서 가볍게 호출(또는 각 RPC가 effective_status로 판단하고 status 정리는 이 함수).
- RLS:
  - `job_posts`: select = 관리자, 주인. (공개 노출은 RPC로만.) insert/update/delete 직접 불가.
  - `job_applications`: select = 본인 지원, 공고 주인(해당 공고), 관리자. 직접 쓰기 불가.
  - `can_view_profile` 재정의: 기존 조건 + 보는 사람의 공고에 지원한 강사.
  - instructor_profiles select 정책에 "보는 센터의 공고에 지원한 강사(공개 꺼도)" 추가 — 지원하면 그 센터는 이력서를 볼 수 있어야 함.
  - 모든 쓰기 RPC는 `is_active()` 확인, `revoke execute from public, anon` 후 필요한 역할에만 grant(공개 RPC 3개는 anon 포함).

- [ ] **Step 1: 실패하는 점검 작성** (`phase2_jobs_checks.sql`, 1단계 점검 스타일, 끝에 `select 'jobs ok'`): `post_requires_business_registration`, `post_tour_requires_travel_business`, `anon_lists_summary_without_description`, `detail_requires_login`, `apply_only_instructor_active`, `cannot_apply_own_job`, `withdraw_only_before_selected`, `select_respects_headcount`(인원 1 공고에 지원 2 → 둘째 선택 거부, 공고 closed/full, 나머지 not_selected), `contact_only_for_selected_own_job`(다른 센터·비선택·비로그인 빈 결과), `anon_cannot_read_applications`, `view_dedupe_and_owner_excluded`, `effective_status_deadline`(deadline=오늘이면 open, 어제면 expired), `edit_keeps_created_at`, `banned_cannot_apply_or_post`, `center_sees_applicant_resume_even_if_private`.
- [ ] **Step 2~4:** 005 작성(idempotent, 001~004 위), database.types 갱신, test/typecheck/build. SQL 실행은 사용자.
- [ ] **Step 5: Commit** — `feat(db): 공고·지원·선택·조회수 (005)` (+ 스펙 §4-1에 "알림은 3단계, 2단계는 지원 현황 상태 표시" 한 줄)

---

### Task 3: `lib/jobs` 도메인 로직·API

**Interfaces:**
- `type JobType = "lesson" | "affiliation" | "tour"`, `type PayUnit = "per_class" | "per_hour" | "per_day" | "per_month" | "total"`, `type JobStatus = "open" | "full" | "expired" | "closed" | "hidden"`, `type ApplicationStatus = "applied" | "selected" | "withdrawn" | "not_selected"`
- `JOB_TYPES: Record<JobType, { label: string; short: string; action: "post_lesson" | "post_affiliation" | "post_tour" }>` — 라벨: 수업 단위 섭외 / 소속 계약 / 투어 동행 강사 모집, 짧게: 수업 / 소속 / 투어
- `PAY_UNITS: Record<PayUnit, string>` — 회당 / 시간당 / 일당 / 월 / 총
- `REQUIREMENT_TAGS` — AIDA 강사 이상, PADI 강사 이상, SSI 강사 이상, Molchanovs 강사 이상, 레스큐 가능, 배상책임보험, 응급처치, 영어 가능, 해외 투어 경험, 입문자 수업 경험
- `formatPay(amount: number | null, unit: PayUnit | null): string` — `"회당 120,000원"`, 미입력 `"협의"`
- `jobDisplayStatus(j, today): JobStatus` — SQL `job_effective_status`와 같은 규칙
- `remainingSlots(headcount: number, selected: number): number` (0 미만 없음)
- `formatJobDates(j): string` — 수업 `11/2(토) 09:00–13:00`, 소속 `월·수·금 저녁`, 투어 `12/5(금)~12/9(화) · 보홀(해외)`
- `metaLine(createdAt, editedAt, views): string` — `"10/21 등록 · 조회 128"`, 수정 시 `"10/21 등록 · 10/22 수정됨 · 조회 128"`
- `missingForJobType(verifiedTypes: DocType[], rules, jobType): DocType[]` (requirement_rules 기반)
- mappers: `jobSummaryFromRow`, `jobDetailFromRow`, `applicationFromRow` (+tests)
- api: `listPublicJobs(filters)`, `getJobSummary(id)`, `getJobDetail(id)`, `createJob(input)`, `updateJob(id, input)`, `closeJob(id)`, `applyToJob(id, message)`, `withdrawApplication(appId)`, `listMyApplications()`, `listMyJobs()`, `listApplicants(jobId)`, `selectApplicant(appId)`, `getApplicantContact(appId)`, `recordJobView(id)`, `fetchPaidMode()`, `fetchRequirementRules()`
- `lib/device-key.ts`: `getDeviceKey(): string` (localStorage `aqua.deviceKey`, 없으면 crypto.randomUUID 기반 생성, try/catch, SSR 안전)

- [ ] 테스트 먼저(`logic.test.ts`, `mappers.test.ts`): formatPay(미입력 협의·천단위), jobDisplayStatus 경계(마감일 당일 open, 다음날 expired, 인원 참 full, hidden 우선), remainingSlots, formatJobDates 3종, metaLine 수정 여부.
- [ ] 구현 → test/typecheck/build → Commit `feat(jobs): 공고 도메인 로직·API`

---

### Task 4: 센터 — 공고 올리기·내 공고 관리

**Files:** `components/jobs/job-form.tsx`, `components/jobs/my-jobs.tsx`, center-shell 공고 탭 연결, 센터 홈 현황 숫자 실제 값.

- 공고 올리기: 종류 고르기(3장 카드) → 종류별 항목 → 미리보기 → 등록. 필요 서류가 없으면 그 종류 카드는 잠기고 `여행업 등록증이 확인되면 올릴 수 있어요` 같은 안내 + "서류 제출하기"(설정 탭) 버튼. 요건은 `fetchRequirementRules` + `effectiveDoc`로 판단(서버도 RPC에서 다시 검사).
- 항목: 제목, 지역(1단계 지역 목록), 장소, 일정(종류별), 단가(금액+단위, "협의" 토글), 모집 인원(1~20), 자격 조건 꼬리표(REQUIREMENT_TAGS 다중), 상세 설명, 마감일(기본: 수업일 전날 / 투어 시작 7일 전 / 소속 14일 후).
- 내 공고: v0 그대로 진행중/마감 탭, 카드(제목·종류 꼬리표·지역·상태·일정·단가·`N명 지원 · 선택 M/정원`·metaLine), 수정(open일 때) · 마감하기(확인 창) · 지원자 보기.
- 센터 홈 현황: 진행중 공고 / 대기 지원자(applied) / 총 지원자.
- [ ] 프리뷰 확인은 컨트롤러. test/typecheck/build → Commit `feat(center): 공고 올리기·관리`

### Task 5: 공개 공고 목록·상세 + 센터 공개 프로필

**Files:** `app/jobs/page.tsx`, `app/jobs/[id]/page.tsx`, `app/centers/[id]/page.tsx`, `components/jobs/{job-card,job-list,job-filters,job-detail,locked-field}.tsx`, `components/centers/center-public-profile.tsx`, 강사 셸 공고 탭 연결, 도입부/로그인 화면에 "공고 둘러보기" 링크.

- 목록: 필터(전체/수업/소속/투어, 지역, `단가 공개 공고만`), 카드(센터명·상태 꼬리표·제목·일정·지역·단가·자격 꼬리표 최대 2·metaLine), 마감 공고는 아래로·흐리게.
- 상세: 요약(누구나) + 상세 설명·센터 상세(잠금: 비로그인 `가입하고 보기` → 가입 화면, 유료 전환 후 비구독 `구독하고 보기`) + 지원하기 버튼(강사·활성·open일 때; 이미 지원했으면 상태 표시) + 고지문 + 공유 버튼(`lib/share-link` 없으면 navigator.share → 클립보드 폴백). 열 때 `recordJobView` 1회.
- 센터 공개 프로필: 센터명·지역·주 교육 장소·교육 요일·사진·서류 사실(`publicFacts`: "사업자등록증 · 확인됨")·**공고 이력**(최근 공고와 제시 단가 목록). 상세 부분은 로그인 필요.
- 로그인 안 한 상태에서 `/jobs`, `/jobs/[id]`, `/centers/[id]`가 앱 셸 없이 바로 열려야 한다(공유 링크). 로그인 상태면 해당 역할 셸 안에서도 같은 컴포넌트 사용.
- [ ] test/typecheck/build → Commit `feat(jobs): 공개 공고 목록·상세·센터 프로필`

### Task 6: 강사 — 지원하기·지원 현황

**Files:** `components/jobs/apply-sheet.tsx`, `components/jobs/my-applications.tsx`, 강사 셸 지원 현황 탭, 강사 홈 숫자(지원 중·총 지원).

- 지원 시트: 공고 요약 + 한마디(선택, 200자) + "내 이력서가 함께 전달돼요" + 이력서 완성도 낮으면 안내 → 지원(확인).
- 지원 현황: 지원함 / 선택됨 / 마감·미선택 / 취소함. 선택됨 카드: `OO센터가 선택했어요. 곧 연락이 갈 거예요` (알림은 3단계). 지원함 상태에서만 "지원 취소".
- [ ] Commit `feat(instructor): 지원하기·지원 현황`

### Task 7: 센터 — 지원자 보기·선택

**Files:** `components/jobs/applicants.tsx`, `components/jobs/applicant-resume.tsx`, center-shell 지원자 탭(전체 공고 지원자) + 공고별 지원자.

- 지원자 카드(v0 구성): 이름·공고명·상태·한마디·지원 시각, `이력서 보기` · `선택하기`.
- 이력서 보기(센터용): 1단계 이력서 항목, `(본인 입력)` 표시, 서류는 `publicFacts`만, **연락처 없음**.
- 선택하기: 확인 창(`선택하면 이 강사의 연락처가 열리고 되돌릴 수 없어요`) → `selectApplicant` → 연락처 카드(휴대폰 tel: 링크·이메일 mailto:) 표시. 인원이 차면 공고 마감 안내.
- [ ] Commit `feat(center): 지원자 보기·선택·연락처 열람`

### Task 8: 관리자 공고 목록 + 마무리

- 관리자 셸에 `공고` 탭: 전체 공고 목록(상태·센터·지원 수·조회수) 읽기 전용. 숨김·신고는 3단계.
- 스펙 §9 화면 목록에 2단계 반영, RELEASE_NOTES v0.2.0, package.json 0.2.0.
- [ ] Commit `feat(admin): 공고 목록 · v0.2.0`

### Task 9: 배포·확인

- [ ] 사용자: 004 → 005 → phase2_pre_checks(`pre2 ok`) → phase2_jobs_checks(`jobs ok`) 실행.
- [ ] 컨트롤러: 로컬에서 테스트 계정으로 흐름 확인 — 센터(사업자등록증 확인 필요 → 테스트 관리자로 확인 처리) 공고 등록 → 비로그인 목록·상세 잠금 → 강사 지원 → 센터 선택 → 연락처 열림 → 다른 강사 지원 불가(인원 참) → 조회수 증가·중복 안 셈.
- [ ] main에 합치고 push → aqua-job.vercel.app에서 공개 목록 확인.
