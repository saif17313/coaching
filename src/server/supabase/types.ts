/** Minimal, explicit domain types for the initial schema. */
export type AppRole = "student" | "teacher";
export type EnrollmentStatus = "pending" | "active" | "rejected" | "cancelled";
export type IsoDate = string;
export type Profile = {
  id: string; role: AppRole; full_name: string; created_at: string; updated_at: string;
};
export type Batch = {
  id: string; code: string; name: string; starts_on: IsoDate | null;
  ends_on: IsoDate | null; capacity: number; is_archived: boolean;
  created_at: string; updated_at: string;
};
export type Enrollment = {
  id: string; student_id: string; batch_id: string; status: EnrollmentStatus;
  requested_at: string; decided_at: string | null;
};
