import "server-only";
import { requirePermission } from "../auth/permissions";
import { validatePrincipal, type Principal } from "../auth/identity";
import { parseBatchInput, parseUuid, type BatchInput } from "../domain/validators";
import type { AppRole, Batch, Enrollment, Profile } from "../supabase/types";

type Actor = Readonly<{ principal: Principal; role: AppRole }>;
export type CoachingStore = {
  getProfile(token: string, id: string): Promise<Profile | null>;
  listBatches(token: string): Promise<Batch[]>;
  listEnrollments(token: string, studentId: string): Promise<Enrollment[]>;
  /** Mutations must be server-side transactions/RPCs and must enforce RLS and constraints. */
  createBatch?(token: string, input: BatchInput): Promise<Batch>;
  requestEnrollment?(token: string, batchId: string): Promise<Enrollment>;
  decideEnrollment?(token: string, enrollmentId: string, approve: boolean): Promise<Enrollment>;
};
function actor(input: Actor): Actor {
  validatePrincipal(input.principal);
  if (input.role !== "teacher" && input.role !== "student") throw new Error("INVALID_ROLE");
  return input;
}
function unavailable(): never { throw new Error("DATABASE_MUTATION_NOT_CONFIGURED"); }

/** Role is trusted only if loaded from verified database identity, not request JSON. */
export function createCoachingService(store: CoachingStore) {
  return {
    async myProfile(input: Actor) {
      const a = actor(input);
      requirePermission(a.role, "profile:read:self");
      return store.getProfile(a.principal.accessToken, a.principal.userId);
    },
    async allBatches(input: Actor) {
      const a = actor(input);
      requirePermission(a.role, "batch:read");
      return store.listBatches(a.principal.accessToken);
    },
    async myEnrollments(input: Actor) {
      const a = actor(input);
      requirePermission(a.role, "enrollment:read:self");
      return store.listEnrollments(a.principal.accessToken, a.principal.userId);
    },
    async createBatch(input: Actor, payload: unknown) {
      const a = actor(input);
      requirePermission(a.role, "batch:create");
      const validated = parseBatchInput(payload);
      if (!store.createBatch) return unavailable();
      return store.createBatch(a.principal.accessToken, validated);
    },
    async requestEnrollment(input: Actor, batchId: unknown) {
      const a = actor(input);
      requirePermission(a.role, "enrollment:request");
      const id = parseUuid(batchId);
      if (!store.requestEnrollment) return unavailable();
      return store.requestEnrollment(a.principal.accessToken, id);
    },
    async decideEnrollment(input: Actor, enrollmentId: unknown, approve: unknown) {
      const a = actor(input);
      requirePermission(a.role, "enrollment:decide");
      const id = parseUuid(enrollmentId);
      if (typeof approve !== "boolean") throw new Error("INVALID_DECISION");
      if (!store.decideEnrollment) return unavailable();
      return store.decideEnrollment(a.principal.accessToken, id, approve);
    },
  };
}
