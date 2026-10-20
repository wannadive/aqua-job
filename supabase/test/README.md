# DB 검사 실행 방법 (개발/테스트 전용)

Supabase 대시보드 → **SQL Editor**에서 아래 순서로 실행한다.

## 1. 마이그레이션 적용 (번호 순서대로)

1. `supabase/migrations/20261021_001_foundation.sql` — 기반 스키마
2. `supabase/migrations/20261022_002_hardening.sql` — 정지·퇴출 계정의 쓰기 차단, 서류 등록 조건 강화
3. `supabase/migrations/20261022_003_multi_role.sql` — 한 계정 여러 역할(`profiles.roles`), 권한 확인을 roles로

각 파일 내용을 통째로 붙여 넣고 **Run**. 반드시 001 → 002 → 003 순서로 실행한다.
여러 번 실행해도 괜찮다(이미 있는 테이블·정책은 건너뛰거나 다시 만든다).

## 2. 보안 검사 (003까지 적용한 뒤)

1. `supabase/test/phase1_checks.sql` → 성공하면 `phase1 ok`
2. `supabase/test/phase1_hardening_checks.sql` → 성공하면 `hardening ok`
3. `supabase/test/phase1_multirole_checks.sql` → 성공하면 `multirole ok`

전체 순서: 001 → 002 → 003 → phase1_checks → phase1_hardening_checks → phase1_multirole_checks

각 파일 내용을 통째로 붙여 넣고 **Run**.

- **성공**: 결과 표에 위의 한 줄이 나온다.
- **실패**: `rls_contacts_hidden 실패`, `banned_cannot_update_contacts 실패`처럼 검사 이름이 들어간 오류가 나온다. 그 오류 메시지를 그대로 복사해서 알려 주면 된다.
- 검사는 `begin … rollback` 안에서 돌기 때문에 테스트 계정·서류가 남지 않는다.
- 보강 검사는 002가 적용되지 않았으면 실패한다(예: `banned_cannot_update_profile_name 실패`).
- 여러 역할 검사는 003이 적용되지 않았으면 실패한다(`roles` 컬럼이 없다는 오류).

## 3. 관리자 지정 (한 번만)

관리자로 쓸 계정으로 앱에서 먼저 가입한 뒤, SQL Editor에서 이메일만 바꿔 실행한다.
관리자·강사·센터 역할을 모두 주면 앱 상단에 [관리자] [강사] [센터] 탭이 생겨 오가며 쓸 수 있다.

```sql
update public.profiles
  set roles = array['admin', 'instructor', 'center'], role = 'admin'
where id = (select id from auth.users where email = '관리자@이메일');
```

관리자 역할만 더하려면 예전처럼 `update public.profiles set role = 'admin' where …`도 된다(가입 역할은 그대로 남고 admin이 roles에 더해진다).

앱 화면에서는 역할을 바꿀 수 없다(트리거가 막는다). 이 구문은 SQL Editor(postgres 권한)에서만 통한다.

> **관리자 계정은 반드시 앱 가입 화면에서 만든다.** 가입 트리거는 가입 유형(강사/센터) 정보가 없는 계정을 거부한다. 그래서 Supabase 대시보드의 "Add user", 초대 메일(invite), 소셜 로그인(OAuth)으로는 계정이 만들어지지 않는다("Database error saving new user"). 앱에서 강사나 센터로 가입한 뒤 위 UPDATE로 관리자로 바꾼다.

> 운영 데이터가 생긴 뒤에는 이 폴더의 검사를 실행할 때 주의한다. 검사는 되돌리지만, 실행 중에는 테스트 계정이 잠깐 만들어진다.

## 테스트 계정 (개발/테스트 전용)

Task 4 가입 흐름 확인용으로 실제 프로젝트에 만든 가짜 계정이다. 운영 전에 Authentication → Users에서 삭제한다.

| 역할 | 이메일 | 비밀번호 |
|------|--------|----------|
| 강사 | test-instructor-1@aquajob.test | .env.local 의 TEST_ACCOUNT_PASSWORD |
| 센터 | test-center-1@aquajob.test | .env.local 의 TEST_ACCOUNT_PASSWORD |

- 강사는 `instructor_profiles` 행이 아직 없어 `onboardingDone=false` → 온보딩 화면으로 분기한다.
- 센터는 센터 홈으로 분기한다.
