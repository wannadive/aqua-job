export interface CenterProfile {
  userId: string;
  centerName: string | null;
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
