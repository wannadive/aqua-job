export interface Certification {
  org: string;
  level: string;
}

export interface Records {
  staSec?: number;
  dynM?: number;
  cwtM?: number;
  fimM?: number;
}

export type Scope = "pool" | "sea" | "overseas_tour";

export interface InstructorProfile {
  userId: string;
  gender: string | null;
  ageBand: string | null;
  regions: string[];
  photoPath: string | null;
  mbti: string | null;
  intro: string | null;
  teachingStyleTags: string[];
  teachingStyleNote: string | null;
  certifications: Certification[];
  instructorLevel: string | null;
  instructorYears: number | null;
  studentsTaught: number | null;
  records: Records;
  pastCenters: string[];
  tourExperience: string | null;
  languages: string[];
  otherCerts: string[];
  availableDays: string[];
  availableTime: string | null;
  scopes: Scope[];
  desiredRate: string | null;
  isPublic: boolean;
  onboardingDone: boolean;
}

export interface ResumeStep {
  key: keyof InstructorProfile | "records";
  title: string;
  help?: string;
  kind: "single" | "multi" | "text" | "number" | "records" | "photo";
}

export interface PrivateContacts {
  phone: string;
  email: string;
}
