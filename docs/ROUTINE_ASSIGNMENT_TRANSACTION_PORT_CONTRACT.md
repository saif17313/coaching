# Routine / Assignment transaction adapter contract

`createStudyOperations(port, {now})` requires a trusted, server-authenticated actor:
`{ id: UUID, role: 'teacher'|'student', verified: true }`. Never populate this object from request JSON or JWT metadata alone.

Mutation adapter: `inTransaction(async tx => ...)` must provide an atomic PostgreSQL transaction with SERIALIZABLE/row-lock handling as appropriate and rollback of every write and audit if any operation fails.

Required transaction functions, by workflow:

- Routine: `assertTeacherManagesBatch`, `assertSubjectInBatch`, `assertRoutineSlotAvailable`, `insertRoutineSlot`, `getRoutineSlotLocked`, `updateRoutineSlot`, `archiveRoutineSlot`, `appendAudit`.
- Assignment lifecycle: `insertAssignment`, `getAssignmentLocked`, `updateAssignmentDraft`, `setAssignmentStatus`, `appendAudit`.
- Submission: `assertActiveEnrollment`, `getSubmissionLocked`, `saveSubmission`, `appendAudit`.
- Grades: `getSubmissionForGradingLocked`, `saveGradeDraft`, `publishGradesAtomic`, `appendAudit`.

Read adapter: `assertTeacherManagesBatch`, `assertActiveEnrollment`, `listRoutineAuthorized`, `listAssignmentsAuthorized`, `assertStudentCanViewSubmission`, `listStudentSubmissionsAuthorized`. The last MUST only reveal published grades; draft points/feedback are never returned. Lists must enforce membership and release before pagination, not after.

Student dashboard: `assertStudentActive`, `getDashboardSnapshotAuthorized`, where returned data is already scope-checked and paginated. Counts and rows must derive from authenticated student ID, not a user-supplied ID.

**Never** connect a PostgREST anonymous client directly to bypass these invariants. SQL exclusion constraints, submission uniqueness, row locks, grade maximums and audit must be tested at the database layer. This package ships no production adapter, storage or HTTP endpoint.
