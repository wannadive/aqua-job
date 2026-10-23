import type { DocType } from "../verification/types.ts";

export type JobType = "lesson" | "affiliation" | "tour";
export type PayUnit = "per_class" | "per_hour" | "per_day" | "per_month" | "total";
export type JobStatus = "open" | "full" | "expired" | "closed" | "hidden";
export type ApplicationStatus = "applied" | "selected" | "withdrawn" | "not_selected";
export type DestinationKind = "domestic" | "overseas";

/** 목록·공개 주소용 요약. 상세 설명·센터 상세는 없다. date는 YYYY-MM-DD, time은 HH:MM */
export interface JobSummary {
  id: string;
  /** 공고 주인 회원 id — 서버가 주인·관리자에게만 준다(그 밖에는 null, 007). 센터 구분은 centerId로 */
  ownerId: string | null;
  /** centers.id — 센터 공개 프로필·공고 이력은 이 값으로 찾는다 */
  centerId: string;
  centerName: string;
  jobType: JobType;
  title: string;
  region: string;
  venue: string | null;
  classDate: string | null;
  startTime: string | null;
  endTime: string | null;
  workDays: string[];
  workTime: string | null;
  tourStart: string | null;
  tourEnd: string | null;
  destination: string | null;
  destinationKind: DestinationKind | null;
  coversFlight: boolean | null;
  coversLodging: boolean | null;
  payAmount: number | null;
  payUnit: PayUnit | null;
  headcount: number;
  remaining: number;
  requirementTags: string[];
  deadline: string;
  viewCount: number;
  createdAt: string;
  editedAt: string | null;
  /** SQL job_effective_status 결과 */
  status: JobStatus;
}

export interface JobCenterInfo {
  centerName: string;
  representativeName: string | null;
  headInstructor: string | null;
  instructorCount: number | null;
  instructorNames: string[];
  monthlyStudents: number | null;
  teachingDays: string[];
  teachingTime: string | null;
  venues: string[];
  address: string | null;
  photoPaths: string[];
}

export interface JobDetail extends JobSummary {
  description: string;
  center: JobCenterInfo;
}

export interface JobApplication {
  id: string;
  jobId: string;
  instructorId: string;
  message: string | null;
  status: ApplicationStatus;
  createdAt: string;
  decidedAt: string | null;
  /** 지원자 이름(센터가 볼 수 있을 때만) */
  applicantName: string | null;
}

/** 내 지원 현황 한 줄: 지원 + 공고 요약(숨김·정지 센터 공고는 null) */
export interface MyApplication extends JobApplication {
  job: JobSummary | null;
}

export interface CenterJobHistoryItem {
  id: string;
  centerId: string;
  title: string;
  jobType: JobType;
  payAmount: number | null;
  payUnit: PayUnit | null;
  createdAt: string;
  status: JobStatus;
}

export interface CenterPublicProfile {
  /** centers.id */
  centerId: string;
  /** 센터 계정(주인) 회원 id — 주인·관리자에게만(그 밖에는 null, 007). 센터 서류 사실은 getCenterPublicFacts(centerId)로 */
  userId: string | null;
  centerName: string;
  venues: string[];
  teachingDays: string[];
  teachingTime: string | null;
  photoPaths: string[];
  detailVisible: boolean;
  representativeName: string | null;
  headInstructor: string | null;
  instructorCount: number | null;
  instructorNames: string[];
  monthlyStudents: number | null;
  address: string | null;
}

export interface JobFilters {
  type?: JobType | null;
  region?: string | null;
  paidOnly?: boolean;
  limit?: number;
  offset?: number;
}

/** 공고 입력(화면용). api가 SQL payload로 바꾼다. */
export interface JobInput {
  jobType: JobType;
  title: string;
  region: string;
  venue?: string | null;
  classDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  workDays?: string[];
  workTime?: string | null;
  tourStart?: string | null;
  tourEnd?: string | null;
  destination?: string | null;
  destinationKind?: DestinationKind | null;
  coversFlight?: boolean;
  coversLodging?: boolean;
  payAmount?: number | null;
  payUnit?: PayUnit | null;
  headcount: number;
  requirementTags?: string[];
  description: string;
  deadline: string;
}

export interface RequirementRule {
  action: "post_lesson" | "post_affiliation" | "post_tour" | "send_offer";
  docType: DocType;
}

/** 공개 화면을 보는 사람. 셸이 현재 로그인 정보를 props로 넘긴다(도메인은 셸을 import하지 않는다). */
export interface JobViewer {
  /** 비로그인이면 null */
  userId: string | null;
  roles: string[];
  /** 활성 계정인지(정지·퇴출이면 false). 신고하기 버튼은 true일 때만 — 최종 판단은 서버(submit_report) */
  active?: boolean;
}
