# DB 검사 실행 방법 (개발/테스트 전용)

Supabase 대시보드 → **SQL Editor**에서 아래 순서로 실행한다.

## 1. 마이그레이션 적용 (번호 순서대로)

1. `supabase/migrations/20261021_001_foundation.sql` — 기반 스키마
2. `supabase/migrations/20261022_002_hardening.sql` — 정지·퇴출 계정의 쓰기 차단, 서류 등록 조건 강화
3. `supabase/migrations/20261022_003_multi_role.sql` — 한 계정 여러 역할(`profiles.roles`), 권한 확인을 roles로
4. `supabase/migrations/20261023_004_pre_phase2.sql` — 2단계 전 정비: 회원 이름 노출 축소(`can_view_profile`), 유효 서류 규칙 하나로(`effective_doc`)
5. `supabase/migrations/20261023_005_jobs.sql` — 2단계 공고: 공고·지원·선택·조회수·유료 스위치(`app_settings.paid_mode`), 공개 요약 RPC, 연락처는 선택한 공고 주인에게만
6. `supabase/migrations/20261024_006_merge_ready.sql` — 핀프렌즈 합류 대비: 테이블 이름 변경(`instructor_profiles`→`talent_profiles`, `documents`→`verification_documents`, `requirement_rules`→`verification_requirements`, `app_settings`→`aqua_settings`), 서류 버킷 `verification-docs`, `centers` 테이블·`job_posts.center_id`, 구독 권한 자리(`center_has_product`/`user_has_product`)
7. `supabase/migrations/20261025_007_phase2_hardening.sql` — 2단계 보안 보강: 직접 조회 정책에도 활성 계정·센터 구독 확인(`talent_profiles`, `job_applications` — 공고 주인에게 지원 취소 행 숨김), `center_profiles` 직접 조회는 주인·관리자만, 공고 수정·지원자 선택·연락처에 센터 구독 확인(마감은 구독 없이 가능), 공고 수정 때 서류 요건 재확인, 공고 입력 한도(마감 90일·지역 목록 `job_region_options()`·글자 수), 공개 RPC의 `owner_id`·센터 `user_id`는 주인·관리자에게만(+ `get_center_public_facts`)
8. `supabase/migrations/20261026_008_pre_paid_security.sql` — 유료 전환 전 보안 정리: 강사 정보(이력서·강사 서류 사실·강사 이름) 판정을 `job_can_view_talent()` 하나로(본인·관리자·구독 센터 × 공개 이력서/내 공고 지원자 — 겸용 계정이 센터라는 이유로는 안 열림), `get_public_facts` 강사 서류는 센터 구독 필요, `job_applications` 공고 주인 분기에 센터 구독, `job_posts` 주인 분기에 활성 계정

각 파일 내용을 통째로 붙여 넣고 **Run**. 반드시 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 순서로 실행한다.
여러 번 실행해도 괜찮다(이미 있는 테이블·정책은 건너뛰거나 다시 만든다).

## 2. 보안 검사 (008까지 적용한 뒤)

006에서 테이블 이름이 바뀌었으므로 아래 검사 파일들도 새 이름(`talent_profiles`, `verification_documents`, `verification_requirements`, `aqua_settings`, 버킷 `verification-docs`)으로 고쳐 두었다. **006을 적용하지 않은 DB에서는 1~5번 검사도 실패한다**(테이블이 없다는 오류).

1. `supabase/test/phase1_checks.sql` → 성공하면 `phase1 ok`
2. `supabase/test/phase1_hardening_checks.sql` → 성공하면 `hardening ok`
3. `supabase/test/phase1_multirole_checks.sql` → 성공하면 `multirole ok`
4. `supabase/test/phase2_pre_checks.sql` → 성공하면 `pre2 ok`
5. `supabase/test/phase2_jobs_checks.sql` → 성공하면 `jobs ok`
6. `supabase/test/phase2_merge_ready_checks.sql` → 성공하면 `merge ok`
7. `supabase/test/phase2_hardening_checks.sql` → 성공하면 `p2hardening ok`
8. `supabase/test/phase3_pre_checks.sql` → 성공하면 `pre3 ok`

전체 순서: 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → phase1_checks → phase1_hardening_checks → phase1_multirole_checks → phase2_pre_checks → phase2_jobs_checks → phase2_merge_ready_checks → phase2_hardening_checks → phase3_pre_checks

007 때문에 고친 기존 검사: `phase2_merge_ready_checks`의 `job_posts_center_id_not_null_and_set_on_create`는 이제 비로그인이 받는 센터 프로필 `user_id`가 null이어야 통과한다(007 전 DB에서는 이 검사가 실패한다).
008 때문에 고친 기존 검사: `phase1_multirole_checks`·`phase2_pre_checks`도 이제 트랜잭션 안에서 `paid_mode=false`로 시작한다 — 센터가 강사 이름·이력서를 보는 조건이 센터 구독에 걸리기 때문(007·008). 이제 모든 검사 파일이 운영 `paid_mode` 값과 상관없이 무료 기간으로 시작한다(유료 전환 검사는 각 파일 안에서 잠깐 켰다 끈다).

각 파일 내용을 통째로 붙여 넣고 **Run**.

- **성공**: 결과 표에 위의 한 줄이 나온다.
- **실패**: `rls_contacts_hidden 실패`, `banned_cannot_update_contacts 실패`처럼 검사 이름이 들어간 오류가 나온다. 그 오류 메시지를 그대로 복사해서 알려 주면 된다.
- 검사는 `begin … rollback` 안에서 돌기 때문에 테스트 계정·서류가 남지 않는다.
- 보강 검사는 002가 적용되지 않았으면 실패한다(예: `banned_cannot_update_profile_name 실패`).
- 여러 역할 검사는 003이 적용되지 않았으면 실패한다(`roles` 컬럼이 없다는 오류).
- 2단계 전 정비 검사는 004가 적용되지 않았으면 실패한다(예: `instructor_cannot_list_other_instructors 실패`).
- 공고 검사는 005가 적용되지 않았으면 실패한다(`create_job_post` 함수가 없다는 오류).
- 합류 대비 검사는 006이 적용되지 않았으면 실패한다(`renamed_tables_exist_old_gone 실패`).
- 2단계 보안 보강 검사는 007이 적용되지 않았으면 실패한다(예: `payload_bounds 실패` 또는 `get_center_public_facts` 함수가 없다는 오류).
- 유료 전 보안 정리 검사는 008이 적용되지 않았으면 실패한다(예: `unsubscribed_center_cannot_list_applications 실패`).

## 3. 관리자 지정 (한 번만)

관리자로 쓸 계정으로 앱에서 먼저 가입한 뒤, SQL Editor에서 이메일만 바꿔 실행한다.
관리자·강사·센터 역할을 모두 주면 앱 상단에 [관리자] [강사] [센터] 탭이 생겨 오가며 쓸 수 있다.

```sql
update public.profiles
  set roles = array['admin', 'instructor', 'center'], role = 'admin'
where id = (select id from auth.users where email = '관리자@이메일');
```

역할을 되돌릴 때(예: 강사만 남기기)도 roles와 role을 함께 적는다.

```sql
update public.profiles
  set roles = array['instructor'], role = 'instructor'
where id = (select id from auth.users where email = '관리자@이메일');
```

`set role = 'admin'`처럼 role만 바꾸면 roles 안의 예전 역할이 새 역할로 **바뀐다**(더해지지 않는다). 가입 유형을 잘못 고른 회원 고치기나 관리자 해제는 이것으로도 된다. 여러 역할을 줄 때는 위처럼 roles를 직접 적는다.

앱 화면에서는 역할을 바꿀 수 없다(트리거가 막는다). 이 구문은 SQL Editor(postgres 권한)에서만 통한다.

> **관리자 계정은 반드시 앱 가입 화면에서 만든다.** 가입 트리거는 가입 유형(강사/센터) 정보가 없는 계정을 거부한다. 그래서 Supabase 대시보드의 "Add user", 초대 메일(invite), 소셜 로그인(OAuth)으로는 계정이 만들어지지 않는다("Database error saving new user"). 앱에서 강사나 센터로 가입한 뒤 위 UPDATE로 관리자로 바꾼다.

> 운영 데이터가 생긴 뒤에는 이 폴더의 검사를 실행할 때 주의한다. 검사는 되돌리지만, 실행 중에는 테스트 계정이 잠깐 만들어진다.

## 테스트 계정 (개발/테스트 전용)

Task 4 가입 흐름 확인용으로 실제 프로젝트에 만든 가짜 계정이다. 운영 전에 Authentication → Users에서 삭제한다.

| 역할 | 이메일 | 비밀번호 |
|------|--------|----------|
| 강사 | test-instructor-1@aquajob.test | .env.local 의 TEST_ACCOUNT_PASSWORD |
| 센터 | test-center-1@aquajob.test | .env.local 의 TEST_ACCOUNT_PASSWORD |

- 강사는 `talent_profiles` 행이 아직 없어 `onboardingDone=false` → 온보딩 화면으로 분기한다.
- 센터는 센터 홈으로 분기한다.
