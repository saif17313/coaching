export type TeacherAccount={id:string;displayName:string;bio:string;phone:string|null;avatarMediaId:string|null;email:string;emailConfirmed:boolean;updatedAt:string|null};
export function accountStamp(value:unknown):boolean;
export function validateTeacherAccount(value:unknown,id:string):TeacherAccount;
export function validateTeacherAccountChanges(value:unknown):{displayName:string;bio:string;phone:string|null;avatarMediaId:string|null};
