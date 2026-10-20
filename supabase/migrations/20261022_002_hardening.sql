-- =====================================================================
-- 아쿠아잡 1단계 보강: 정지·퇴출 계정의 쓰기 차단 + 서류 등록 조건 강화
-- 001(기반 스키마)을 실행한 뒤 Supabase SQL Editor에서 통째로 실행한다.
-- 다시 실행해도 깨지지 않게 썼다(drop policy if exists → create policy).
--
-- 1) profiles·private_contacts 본인 수정, documents 버킷 본인 파일 삭제는 활성 계정만
-- 2) documents 등록: 사진 경로 필수, 서류 종류는 가입 유형(강사/센터)에 맞는 것만
--    (서류 종류 목록은 lib/verification/config.ts의 DOC_TYPES.owner와 같아야 한다)
-- =====================================================================

-- profiles: 활성 상태의 본인만 수정(특권 컬럼은 001의 트리거가 계속 막는다)
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active()))
  with check (id = (select auth.uid()) and (select public.is_active()));

-- private_contacts: 활성 상태의 본인만 수정(조회 정책은 001 그대로)
drop policy if exists private_contacts_update_own on public.private_contacts;
create policy private_contacts_update_own on public.private_contacts
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()))
  with check (user_id = (select auth.uid()) and (select public.is_active()));

-- documents: 활성 상태의 본인만 '제출됨'으로 등록. 사진 경로는 필수이고 본인 폴더여야 한다.
-- 서류 종류는 가입 유형에 맞아야 한다(강사가 사업자등록증을 내는 식의 엉뚱한 제출을 막는다).
drop policy if exists documents_insert_own_submitted on public.documents;
create policy documents_insert_own_submitted on public.documents
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.is_active())
    and status = 'submitted'
    and valid_until is null
    and reject_reason is null
    and reviewed_by is null
    and verified_at is null
    -- 사진 없는 서류는 받지 않는다. 남의 파일 경로를 자기 서류로 거는 것도 막는다
    and file_path is not null
    and split_part(file_path, '/', 1) = (select auth.uid())::text
    -- 미래 시각으로 넣어 '최신 서류' 자리를 붙잡아 두는 것을 막는다
    and submitted_at <= now() + interval '1 minute'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and (
          (p.role = 'instructor'
           and documents.doc_type in ('instructor_cert', 'liability_insurance', 'first_aid', 'id_card'))
          or (p.role = 'center'
           and documents.doc_type in ('business_registration', 'travel_business', 'representative_id', 'rep_instructor_cert'))
        )
    )
  );

-- Storage documents 버킷: 본인 파일 삭제도 활성 상태일 때만(관리자 삭제 정책은 001 그대로)
drop policy if exists documents_owner_delete on storage.objects;
create policy documents_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active())
  );
