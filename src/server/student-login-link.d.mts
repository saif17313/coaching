export declare function isUuid(value: unknown): value is string;
export declare function validOfflineStudent(input: unknown): input is {fullName: string};
export declare function validLoginEmail(input: unknown): input is {email: string};
export declare function rpcFailure(status: number, body: unknown): {status: number; code: string};
export declare function validLinkedAuthUser(user: unknown, studentId: string, email: string): boolean;
