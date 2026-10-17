import "server-only";
import { readSupabaseRows } from "./rest";
import type { Batch, Enrollment, Profile } from "./types";

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function uuid(value: string): string {
  if (!isUuid(value)) throw new Error("Invalid UUID");
  return value;
}
export const coachingReads = {
  /** RLS restricts this to the authenticated user or teacher. */
  profiles: (accessToken: string, userId: string) =>
    readSupabaseRows<Profile>("profiles", accessToken, { select: "id,role,full_name,created_at,updated_at", id: `eq.${uuid(userId)}`, limit: "1" }),
  batches: (accessToken: string) =>
    readSupabaseRows<Batch>("batches", accessToken, { select: "id,code,name,starts_on,ends_on,capacity,is_archived,created_at,updated_at", order: "created_at.desc", limit: "100" }),
  enrollments: (accessToken: string, studentId: string) =>
    readSupabaseRows<Enrollment>("enrollments", accessToken, { select: "id,student_id,batch_id,status,requested_at,decided_at", student_id: `eq.${uuid(studentId)}`, limit: "100" }),
};
