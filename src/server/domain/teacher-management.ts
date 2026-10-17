import type { EnrollmentStatus } from '../supabase/types';
import { parseUuid, parseBatchInput } from './validators';

export type EnrollmentCommand = Readonly<{ enrollmentId: string; decision: 'approve' | 'reject' | 'cancel' }>;
export type AcademicSubjectInput = Readonly<{ code: string; title: string; batchId: string }>;
export type AcademicUnitInput = Readonly<{ subjectId: string; ordinal: number; title: string }>;

const transitions: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  pending: ['active', 'rejected', 'cancelled'],
  active: ['cancelled'],
  rejected: [],
  cancelled: [],
};
export function assertEnrollmentTransition(from: EnrollmentStatus, to: EnrollmentStatus): void {
  if (!Object.prototype.hasOwnProperty.call(transitions, from) || !transitions[from].includes(to))
    throw new Error('INVALID_ENROLLMENT_TRANSITION');
}
export function decideEnrollmentStatus(from: EnrollmentStatus, decision: EnrollmentCommand['decision']): EnrollmentStatus {
  const target: EnrollmentStatus = decision === 'approve' ? 'active' : decision === 'reject' ? 'rejected' : 'cancelled';
  assertEnrollmentTransition(from, target);
  return target;
}
export function assertBatchHasCapacity(activeCount: number, capacity: number): void {
  if (!Number.isSafeInteger(activeCount) || activeCount < 0 || !Number.isSafeInteger(capacity) || capacity < 1)
    throw new Error('INVALID_BATCH_CAPACITY_STATE');
  if (activeCount >= capacity) throw new Error('BATCH_FULL');
}
export function parseBatchPatch(v: unknown) {
  // Whole-resource PUT contract; avoids accidentally nulling omitted properties.
  return parseBatchInput(v);
}
export function parseSubject(v: unknown): AcademicSubjectInput {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('INVALID_SUBJECT');
  const x = v as Record<string, unknown>;
  if (typeof x.code !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/.test(x.code)) throw new Error('INVALID_SUBJECT_CODE');
  if (typeof x.title !== 'string' || !x.title.trim() || x.title.trim().length > 160) throw new Error('INVALID_SUBJECT_TITLE');
  return { code: x.code, title: x.title.trim(), batchId: parseUuid(x.batchId) };
}
export function parseAcademicUnit(v: unknown): AcademicUnitInput {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('INVALID_UNIT');
  const x = v as Record<string, unknown>;
  if (!Number.isSafeInteger(x.ordinal) || (x.ordinal as number) < 1 || (x.ordinal as number) > 1000) throw new Error('INVALID_UNIT_ORDER');
  if (typeof x.title !== 'string' || !x.title.trim() || x.title.trim().length > 160) throw new Error('INVALID_UNIT_TITLE');
  return { subjectId: parseUuid(x.subjectId), ordinal: x.ordinal as number, title: x.title.trim() };
}
