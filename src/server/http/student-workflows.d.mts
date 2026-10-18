export type StudentWorkflowKind='submit'|'ownSubmission'|'submissionList'|'grade'|'gradePublish'|'notificationRead'|'unreadCount';
export type StudentWorkflowCommand={token:string;actorId:string;operationId:string|null;target:string|null;data:Readonly<Record<string,unknown>>};
export function createStudentWorkflow(kind:StudentWorkflowKind,ports:{verify:(token:string)=>Promise<unknown>;execute:(kind:StudentWorkflowKind,command:StudentWorkflowCommand)=>Promise<unknown>}):(req:Request,ctx?:{params?:Promise<Record<string,string>>|Record<string,string>})=>Promise<Response>;
export const studentWorkflowKinds:readonly StudentWorkflowKind[];
