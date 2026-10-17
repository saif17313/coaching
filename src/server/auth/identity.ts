import "server-only";

export type Principal = Readonly<{ userId: string; accessToken: string }>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** This is NOT a JWT verifier: authentication must happen through Supabase Auth. */
export async function requireVerifiedPrincipal(): Promise<Principal> {
  throw new Error("AUTH_NOT_CONFIGURED: Supabase Auth verification is not connected. Denying request.");
}
export function validatePrincipal(p: Principal): Principal {
  if (!uuidPattern.test(p.userId) || !p.accessToken || /[\r\n]/.test(p.accessToken)) {
    throw new Error("Invalid verified principal");
  }
  return p;
}
