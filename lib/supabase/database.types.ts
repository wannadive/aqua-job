// 손으로 쓴 DB 타입 (supabase/migrations/ 001 기반 스키마 + 003 여러 역할 + 005 공고 + 006 합류 대비 이름·centers 기준).
// 스키마를 바꾸면 여기도 같이 고친다.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "instructor" | "center" | "admin";
export type AccountStatus = "active" | "suspended" | "banned";
export type DocTypeValue =
  | "instructor_cert"
  | "liability_insurance"
  | "first_aid"
  | "id_card"
  | "business_registration"
  | "travel_business"
  | "representative_id"
  | "rep_instructor_cert";
export type DocStatusValue = "submitted" | "verified" | "rejected";
export type RequirementAction = "post_lesson" | "post_affiliation" | "post_tour" | "send_offer";
/** 006 서류 원본 버킷: 새 서류 verification-docs, 006 이전 서류 documents */
export type VerificationBucket = "verification-docs" | "documents";
/** 006 구독 상품: aquajob(센터 공고·제안) · aquajob_talent(강사 상세·지원) · center_app(센터앱, 예약) */
export type ProductKey = "aquajob" | "aquajob_talent" | "center_app";
export type CenterKind = "listing" | "managed";

// 005 공고
export type JobTypeValue = "lesson" | "affiliation" | "tour";
export type PayUnitValue = "per_class" | "per_hour" | "per_day" | "per_month" | "total";
/** 저장 상태 */
export type JobPostStatus = "open" | "closed" | "hidden";
export type JobClosedReason = "manual" | "full" | "expired";
/** job_effective_status: hidden > closed(사유별 full·expired·closed) > expired > full > open */
export type JobEffectiveStatus = "open" | "full" | "expired" | "closed" | "hidden";
export type ApplicationStatusValue = "applied" | "selected" | "withdrawn" | "not_selected";
export type DestinationKind = "domestic" | "overseas";

/** list_public_jobs · get_job_summary 한 행(상세 설명·센터 상세 없음). date는 YYYY-MM-DD, time은 HH:MM:SS */
export interface JobSummaryRow {
  id: string;
  /** 공고 주인 회원 id — 주인·관리자에게만, 그 밖에는 null (007) */
  owner_id: string | null;
  /** centers.id (006) */
  center_id: string;
  center_name: string;
  job_type: JobTypeValue;
  title: string;
  region: string;
  venue: string | null;
  class_date: string | null;
  start_time: string | null;
  end_time: string | null;
  work_days: string[] | null;
  work_time: string | null;
  tour_start: string | null;
  tour_end: string | null;
  destination: string | null;
  destination_kind: DestinationKind | null;
  covers_flight: boolean | null;
  covers_lodging: boolean | null;
  pay_amount: number | null;
  pay_unit: PayUnitValue | null;
  headcount: number;
  /** 남은 인원(0 미만 없음) */
  remaining: number;
  requirement_tags: string[];
  deadline: string;
  view_count: number;
  created_at: string;
  edited_at: string | null;
  effective_status: JobEffectiveStatus;
}

/** get_job_detail의 센터 상세(연락처 없음) */
export interface JobDetailCenter {
  center_name: string;
  representative_name: string | null;
  head_instructor: string | null;
  instructor_count: number | null;
  instructor_names: string[];
  monthly_students: number | null;
  teaching_days: string[];
  teaching_time: string | null;
  venues: string[];
  address: string | null;
  photo_paths: string[];
}

export interface JobDetailRow extends JobSummaryRow {
  description: string;
  center: JobDetailCenter;
}

/** get_public_facts: 종류별 유효 서류의 사실만(파일·번호 없음) */
export interface PublicFactRow {
  doc_type: DocTypeValue;
  valid_until: string | null;
  verified_at: string | null;
  org: string | null;
  grade: string | null;
}

/** get_center_public_profile: detail_visible=false면 상세 칸은 null */
export interface CenterPublicProfileRow {
  /** centers.id (006) */
  center_id: string;
  /** 센터 계정(주인) 회원 id — 주인·관리자에게만, 그 밖에는 null (007) */
  user_id: string | null;
  center_name: string;
  venues: string[];
  teaching_days: string[];
  teaching_time: string | null;
  photo_paths: string[];
  detail_visible: boolean;
  representative_name: string | null;
  head_instructor: string | null;
  instructor_count: number | null;
  instructor_names: string[] | null;
  monthly_students: number | null;
  address: string | null;
}

export interface CenterJobHistoryRow {
  id: string;
  center_id: string;
  title: string;
  job_type: JobTypeValue;
  pay_amount: number | null;
  pay_unit: PayUnitValue | null;
  created_at: string;
  effective_status: JobEffectiveStatus;
}

/** create_job_post · update_job_post payload. 종류별 필수: lesson=class_date, tour=tour_start·tour_end·destination */
export interface JobPostPayload {
  job_type: JobTypeValue;
  title: string;
  region: string;
  venue?: string | null;
  class_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  work_days?: string[];
  work_time?: string | null;
  tour_start?: string | null;
  tour_end?: string | null;
  destination?: string | null;
  destination_kind?: DestinationKind | null;
  covers_flight?: boolean;
  covers_lodging?: boolean;
  /** pay_amount·pay_unit 둘 다 null이면 협의 */
  pay_amount?: number | null;
  pay_unit?: PayUnitValue | null;
  headcount: number;
  requirement_tags?: string[];
  description: string;
  deadline: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          /** 대표 역할(가입 역할). 항상 roles 안에 있다 */
          role: UserRole;
          /** 이 계정이 가진 역할 전부(003). 비어 있지 않다 */
          roles: UserRole[];
          display_name: string;
          account_status: AccountStatus;
          center_id: string | null;
          created_at: string;
          updated_at: string;
        };
        // 가입 트리거만 만든다(사용자 insert 정책 없음)
        Insert: {
          id: string;
          role: UserRole;
          roles?: UserRole[];
          display_name: string;
          account_status?: AccountStatus;
          center_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        // role·roles·account_status·center_id는 트리거가 막는다(관리자·서버만)
        Update: {
          id?: string;
          role?: UserRole;
          roles?: UserRole[];
          display_name?: string;
          account_status?: AccountStatus;
          center_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      private_contacts: {
        Row: {
          user_id: string;
          phone: string | null;
          email: string | null;
        };
        Insert: {
          user_id: string;
          phone?: string | null;
          email?: string | null;
        };
        Update: {
          user_id?: string;
          phone?: string | null;
          email?: string | null;
        };
        Relationships: [];
      };
      talent_profiles: {
        Row: {
          user_id: string;
          gender: string | null;
          age_band: string | null;
          regions: string[];
          photo_path: string | null;
          mbti: string | null;
          intro: string | null;
          teaching_style_tags: string[];
          teaching_style_note: string | null;
          /** [{ org, level }] */
          certifications: Json;
          instructor_level: string | null;
          instructor_years: number | null;
          students_taught: number | null;
          /** { sta_sec, dyn_m, cwt_m, fim_m } */
          records: Json;
          past_centers: string[];
          tour_experience: string | null;
          languages: string[];
          other_certs: string[];
          available_days: string[];
          available_time: string | null;
          /** pool | sea | overseas_tour */
          scopes: string[];
          desired_rate: string | null;
          is_public: boolean;
          onboarding_done: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          gender?: string | null;
          age_band?: string | null;
          regions?: string[];
          photo_path?: string | null;
          mbti?: string | null;
          intro?: string | null;
          teaching_style_tags?: string[];
          teaching_style_note?: string | null;
          certifications?: Json;
          instructor_level?: string | null;
          instructor_years?: number | null;
          students_taught?: number | null;
          records?: Json;
          past_centers?: string[];
          tour_experience?: string | null;
          languages?: string[];
          other_certs?: string[];
          available_days?: string[];
          available_time?: string | null;
          scopes?: string[];
          desired_rate?: string | null;
          is_public?: boolean;
          onboarding_done?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          gender?: string | null;
          age_band?: string | null;
          regions?: string[];
          photo_path?: string | null;
          mbti?: string | null;
          intro?: string | null;
          teaching_style_tags?: string[];
          teaching_style_note?: string | null;
          certifications?: Json;
          instructor_level?: string | null;
          instructor_years?: number | null;
          students_taught?: number | null;
          records?: Json;
          past_centers?: string[];
          tour_experience?: string | null;
          languages?: string[];
          other_certs?: string[];
          available_days?: string[];
          available_time?: string | null;
          scopes?: string[];
          desired_rate?: string | null;
          is_public?: boolean;
          onboarding_done?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      center_profiles: {
        Row: {
          user_id: string;
          center_name: string | null;
          representative_name: string | null;
          head_instructor: string | null;
          instructor_count: number | null;
          instructor_names: string[];
          monthly_students: number | null;
          teaching_days: string[];
          teaching_time: string | null;
          venues: string[];
          address: string | null;
          photo_paths: string[];
          /** 006: 주인의 centers.id. 트리거가 항상 채운다(넣은 값은 무시) */
          center_id: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          center_name?: string | null;
          representative_name?: string | null;
          head_instructor?: string | null;
          instructor_count?: number | null;
          instructor_names?: string[];
          monthly_students?: number | null;
          teaching_days?: string[];
          teaching_time?: string | null;
          venues?: string[];
          address?: string | null;
          photo_paths?: string[];
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          center_name?: string | null;
          representative_name?: string | null;
          head_instructor?: string | null;
          instructor_count?: number | null;
          instructor_names?: string[];
          monthly_students?: number | null;
          teaching_days?: string[];
          teaching_time?: string | null;
          venues?: string[];
          address?: string | null;
          photo_paths?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      verification_documents: {
        Row: {
          id: string;
          owner_id: string;
          doc_type: DocTypeValue;
          status: DocStatusValue;
          /** 원본이 있는 버킷(006). 새 서류는 verification-docs */
          bucket: VerificationBucket;
          /** 신분증은 확인 후 null */
          file_path: string | null;
          /** YYYY-MM-DD */
          valid_until: string | null;
          /** { org?, grade?, number? } */
          meta: Json;
          reject_reason: string | null;
          submitted_at: string;
          reviewed_by: string | null;
          verified_at: string | null;
        };
        // RLS: 본인·활성·status 'submitted'만, 심사 컬럼은 비워야 한다
        Insert: {
          id?: string;
          owner_id: string;
          doc_type: DocTypeValue;
          status?: "submitted";
          /** RLS: 새 서류는 verification-docs만 */
          bucket?: "verification-docs";
          file_path?: string | null;
          meta?: Json;
          submitted_at?: string;
        };
        // 사용자 update 정책 없음 — review_document RPC로만 바뀐다
        Update: {
          id?: string;
          owner_id?: string;
          doc_type?: DocTypeValue;
          status?: DocStatusValue;
          bucket?: VerificationBucket;
          file_path?: string | null;
          valid_until?: string | null;
          meta?: Json;
          reject_reason?: string | null;
          submitted_at?: string;
          reviewed_by?: string | null;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      verification_requirements: {
        Row: {
          action: RequirementAction;
          doc_type: DocTypeValue;
        };
        Insert: {
          action: RequirementAction;
          doc_type: DocTypeValue;
        };
        Update: {
          action?: RequirementAction;
          doc_type?: DocTypeValue;
        };
        Relationships: [];
      };
      admin_actions: {
        Row: {
          id: string;
          admin_id: string | null;
          target_user_id: string | null;
          action: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          target_user_id?: string | null;
          action: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          target_user_id?: string | null;
          action?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      aqua_settings: {
        Row: { key: string; value: Json };
        // 관리자만 쓴다(RLS)
        Insert: { key: string; value: Json };
        Update: { key?: string; value?: Json };
        Relationships: [];
      };
      // 006: 센터(테넌트) 자리. 누구나 id·name·kind·created_at만 읽는다(owner_user_id는 칸 권한 없음). 쓰기는 트리거만
      centers: {
        Row: {
          id: string;
          owner_user_id: string;
          name: string | null;
          kind: CenterKind;
          created_at: string;
        };
        Insert: { [_ in never]: never };
        Update: { [_ in never]: never };
        Relationships: [];
      };
      job_posts: {
        Row: {
          id: string;
          owner_id: string;
          /** centers.id (006부터 NOT NULL) */
          center_id: string;
          job_type: JobTypeValue;
          title: string;
          region: string;
          venue: string | null;
          class_date: string | null;
          start_time: string | null;
          end_time: string | null;
          work_days: string[] | null;
          work_time: string | null;
          tour_start: string | null;
          tour_end: string | null;
          destination: string | null;
          destination_kind: DestinationKind | null;
          covers_flight: boolean | null;
          covers_lodging: boolean | null;
          pay_amount: number | null;
          pay_unit: PayUnitValue | null;
          headcount: number;
          requirement_tags: string[];
          description: string;
          deadline: string;
          status: JobPostStatus;
          closed_reason: JobClosedReason | null;
          view_count: number;
          created_at: string;
          edited_at: string | null;
        };
        // 직접 쓰기 불가 — create_job_post · update_job_post · close_job_post RPC로만
        Insert: { [_ in never]: never };
        Update: { [_ in never]: never };
        Relationships: [];
      };
      job_applications: {
        Row: {
          id: string;
          job_id: string;
          instructor_id: string;
          message: string | null;
          status: ApplicationStatusValue;
          created_at: string;
          decided_at: string | null;
        };
        // 직접 쓰기 불가 — apply_to_job · withdraw_application · select_applicant RPC로만
        Insert: { [_ in never]: never };
        Update: { [_ in never]: never };
        Relationships: [];
      };
      // job_views는 직접 접근 불가(record_job_view RPC로만) — 타입에 넣지 않는다
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_active: { Args: Record<string, never>; Returns: boolean };
      review_document: {
        Args: {
          p_doc_id: string;
          p_decision: "verified" | "rejected";
          p_valid_until?: string | null;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      has_requirements: {
        Args: { p_user: string; p_action: RequirementAction };
        Returns: boolean;
      };
      can_view_job_detail: { Args: { p_job?: string | null }; Returns: boolean };
      paid_mode: { Args: Record<string, never>; Returns: boolean };
      list_public_jobs: {
        Args: {
          p_type?: JobTypeValue | null;
          p_region?: string | null;
          p_paid_only?: boolean;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: JobSummaryRow[];
      };
      get_job_summary: { Args: { p_job: string }; Returns: JobSummaryRow[] };
      get_job_detail: { Args: { p_job: string }; Returns: JobDetailRow[] };
      record_job_view: { Args: { p_job: string; p_device_key?: string | null }; Returns: undefined };
      get_public_facts: { Args: { p_user: string }; Returns: PublicFactRow[] };
      /** p_center_id = centers.id (006) */
      get_center_public_profile: { Args: { p_center_id: string }; Returns: CenterPublicProfileRow[] };
      list_center_job_history: { Args: { p_center_id: string }; Returns: CenterJobHistoryRow[] };
      /** 007: 센터 서류 사실(센터 서류 종류만), centers.id로 */
      get_center_public_facts: { Args: { p_center_id: string }; Returns: PublicFactRow[] };
      /** 007: 공고 지역 목록(REGION_OPTIONS와 같아야 함) */
      job_region_options: { Args: Record<string, never>; Returns: string[] };
      /** 007: 호출자 센터가 활성 + aquajob 구독인가 */
      job_center_entitled: { Args: Record<string, never>; Returns: boolean };
      /** 006 구독 자리: 무료 기간엔 true, 유료 전환 후엔 결제 연동 전까지 관리자만 */
      user_has_product: { Args: { p_user: string; p_product: ProductKey }; Returns: boolean };
      center_has_product: { Args: { p_center_id: string; p_product: ProductKey }; Returns: boolean };
      get_applicant_contact: {
        Args: { p_app: string };
        Returns: { phone: string | null; email: string | null }[];
      };
      expire_jobs: { Args: Record<string, never>; Returns: number };
      create_job_post: { Args: { payload: JobPostPayload }; Returns: string };
      update_job_post: { Args: { p_job: string; payload: JobPostPayload }; Returns: undefined };
      close_job_post: { Args: { p_job: string }; Returns: undefined };
      apply_to_job: { Args: { p_job: string; p_message?: string | null }; Returns: string };
      withdraw_application: { Args: { p_app: string }; Returns: undefined };
      select_applicant: { Args: { p_app: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
