# DB 검사 실행 방법 (개발/테스트 전용)

Supabase 대시보드 → **SQL Editor**에서 아래 순서로 실행한다.

## 1. 마이그레이션 적용

`supabase/migrations/20261021_001_foundation.sql` 내용을 통째로 붙여 넣고 **Run**.
여러 번 실행해도 괜찮다(이미 있는 테이블·정책은 건너뛰거나 다시 만든다).

## 2. 보안 검사

`supabase/test/phase1_checks.sql` 내용을 통째로 붙여 넣고 **Run**.

- **성공**: 결과 표에 `phase1 ok` 한 줄이 나온다.
- **실패**: `rls_contacts_hidden 실패`처럼 검사 이름이 들어간 오류가 나온다. 그 오류 메시지를 그대로 복사해서 알려 주면 된다.
- 검사는 `begin … rollback` 안에서 돌기 때문에 테스트 계정·서류가 남지 않는다.

## 3. 관리자 지정 (한 번만)

관리자로 쓸 계정으로 앱에서 먼저 가입한 뒤, SQL Editor에서 이메일만 바꿔 실행한다.

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = '관리자@이메일');
```

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
