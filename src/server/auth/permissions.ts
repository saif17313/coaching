import "server-only";
import type { AppRole } from "../supabase/types";

export type Action =
  | "profile:read:self" | "profile:read:any"
  | "batch:read" | "batch:create" | "batch:update" | "batch:archive"
  | "enrollment:read:self" | "enrollment:read:any"
  | "enrollment:request" | "enrollment:decide";

const grants: Record<AppRole, readonly Action[]> = {
  student: ["profile:read:self", "batch:read", "enrollment:read:self", "enrollment:request"],
  teacher: ["profile:read:self", "profile:read:any", "batch:read", "batch:create", "batch:update", "batch:archive", "enrollment:read:any", "enrollment:decide"],
};
export function permitted(role: AppRole, action: Action): boolean {
  return Object.prototype.hasOwnProperty.call(grants, role) && grants[role].includes(action);
}
export function requirePermission(role: AppRole, action: Action): void {
  if (!permitted(role, action)) throw new Error("FORBIDDEN");
}
