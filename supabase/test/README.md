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

> 운영 데이터가 생긴 뒤에는 이 폴더의 검사를 실행할 때 주의한다. 검사는 되돌리지만, 실행 중에는 테스트 계정이 잠깐 만들어진다.
