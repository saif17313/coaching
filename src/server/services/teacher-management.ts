import 'server-only';
import { requirePermission } from '../auth/permissions';
import { validatePrincipal, type Principal } from '../auth/identity';
import { parseUuid } from '../domain/validators';
import { assertBatchHasCapacity, decideEnrollmentStatus, parseAcademicUnit, parseBatchPatch, parseSubject } from '../domain/teacher-management';
import type { AppRole, Batch, Enrollment, EnrollmentStatus } from '../supabase/types';

/** Caller must resolve role from protected database record, never from HTTP payload. */
export type VerifiedActor = Readonly<{ principal: Principal; role: AppRole }>;
export type AcademicSubject = Readonly<{ id: string; batchId: string; code: string; title: string }>;
export type AcademicUnit = Readonly<{ id: string; subjectId: string; ordinal: number; title: string }>;
export interface TeacherTransactionPort {
  /** Must be an atomic database transaction with RLS/server-side role re-verification. */
  createBatch(actor: VerifiedActor, input: ReturnType<typeof parseBatchPatch>): Promise<Batch>;
  archiveBatch(actor: VerifiedActor, batchId: string): Promise<Batch>;
  /** Must lock enrollment/batch rows and check activeCount and capacity atomically. */
  decideEnrollment(actor: VerifiedActor, enrollmentId: string, decision: 'approve' | 'reject' | 'cancel', expectedStatus: EnrollmentStatus): Promise<Enrollment>;
  createSubject(actor: VerifiedActor, input: ReturnType<typeof parseSubject>): Promise<AcademicSubject>;
  createUnit(actor: VerifiedActor, input: ReturnType<typeof parseAcademicUnit>): Promise<AcademicUnit>;
}
function guarded(actor: VerifiedActor): VerifiedActor {
  validatePrincipal(actor.principal);
  if (actor.role !== 'teacher') throw new Error('FORBIDDEN');
  return actor;
}
/** No database port wired before Supabase integration; mutations reject rather than simulate writes. */
export function createTeacherManagementService(port?: TeacherTransactionPort) {
  const db = () => { if (!port) throw new Error('DATABASE_TRANSACTION_NOT_CONFIGURED'); return port; };
  return {
    createBatch(actor: VerifiedActor, body: unknown) {
      const a = guarded(actor); requirePermission(a.role, 'batch:create');
      return db().createBatch(a, parseBatchPatch(body));
    },
    archiveBatch(actor: VerifiedActor, id: unknown) {
      const a = guarded(actor); requirePermission(a.role, 'batch:archive');
      return db().archiveBatch(a, parseUuid(id));
    },
    decideEnrollment(actor: VerifiedActor, id: unknown, decision: unknown, expected: EnrollmentStatus) {
      const a = guarded(actor); requirePermission(a.role, 'enrollment:decide');
      if (decision !== 'approve' && decision !== 'reject' && decision !== 'cancel') throw new Error('INVALID_DECISION');
      decideEnrollmentStatus(expected, decision);
      return db().decideEnrollment(a, parseUuid(id), decision, expected);
    },
    createSubject(actor: VerifiedActor, body: unknown) {
      const a = guarded(actor); requirePermission(a.role, 'batch:update');
      return db().createSubject(a, parseSubject(body));
    },
    createUnit(actor: VerifiedActor, body: unknown) {
      const a = guarded(actor); requirePermission(a.role, 'batch:update');
      return db().createUnit(a, parseAcademicUnit(body));
    },
  };
}
// Pure invariants are also exported so transaction adapters can enforce after obtaining locks.
export { assertBatchHasCapacity };
