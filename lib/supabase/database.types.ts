// 손으로 쓴 DB 타입 (supabase/migrations/20261021_001_foundation.sql 기준).
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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
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
          display_name: string;
          account_status?: AccountStatus;
          center_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        // role·account_status·center_id는 트리거가 막는다(관리자·서버만)
        Update: {
          id?: string;
          role?: UserRole;
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
      instructor_profiles: {
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
      documents: {
        Row: {
          id: string;
          owner_id: string;
          doc_type: DocTypeValue;
          status: DocStatusValue;
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
      requirement_rules: {
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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
