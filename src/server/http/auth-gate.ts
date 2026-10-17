import "server-only";
import { requireVerifiedPrincipal } from "../auth/identity";
/** API endpoints must use verified Supabase sessions; bearer strings alone are never authority. */
export async function requireAuthenticatedRequest() {
  return requireVerifiedPrincipal();
}
