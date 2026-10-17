/** Proposed v1 routes. No routes are registered until authenticated sessions are available. */
export const teacherApiContracts = Object.freeze({
  batches: { list: 'GET /api/v1/teacher/batches', create: 'POST /api/v1/teacher/batches', archive: 'POST /api/v1/teacher/batches/{id}/archive' },
  students: { list: 'GET /api/v1/teacher/students', detail: 'GET /api/v1/teacher/students/{id}' },
  enrollments: { list: 'GET /api/v1/teacher/enrollments', decide: 'POST /api/v1/teacher/enrollments/{id}/decision' },
  academic: { subjects: 'POST /api/v1/teacher/subjects', units: 'POST /api/v1/teacher/units' },
} as const);
export type TeacherApiArea = keyof typeof teacherApiContracts;
