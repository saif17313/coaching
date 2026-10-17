import "server-only";
import { coachingReads } from "../supabase/repository";
import type { CoachingStore } from "./coaching";

/** Read-only until live database roles and transaction RPCs are verified. */
export const readOnlyCoachingStore: CoachingStore = {
  async getProfile(token, id) { return (await coachingReads.profiles(token, id))[0] ?? null; },
  listBatches: (token) => coachingReads.batches(token),
  listEnrollments: (token, studentId) => coachingReads.enrollments(token, studentId),
};
