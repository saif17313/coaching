import "server-only";

/**
 * Phase 1 read-only PostgREST adapter; caller passes a verified Supabase Auth
 * bearer access token. Publishable key alone NEVER authorizes a user request.
 * No service-role credentials or browser exposure are supported.
 */
export class SupabaseReadError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "SupabaseReadError";
  }
}

const ALLOWED = new Set(["profiles", "batches", "enrollments"]);

function config() {
  const raw = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!raw || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
  const url = new URL(raw);
  const hosted = url.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) && !url.port;
  const local = process.env.NODE_ENV === "development" &&
    process.env.COACHING_LOCAL_SUPABASE_TESTING === "allow-loopback-54321" &&
    url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "54321";
  if (!(hosted || local) || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      /[\r\n]/.test(key) || key.length > 4096) {
    throw new Error("SUPABASE_URL must be a clean hosted HTTPS URL (or explicitly allowed local development loopback)");
  }
  return { url, key };
}

export async function readSupabaseRows<T>(
  table: "profiles" | "batches" | "enrollments",
  accessToken: string,
  query: Readonly<Record<string, string>>,
): Promise<T[]> {
  if (!ALLOWED.has(table)) throw new Error("Unsupported table");
  if (!accessToken || /[\r\n]/.test(accessToken)) throw new Error("A valid user access token is required");
  const { url: root, key } = config();
  const url = new URL(`/rest/v1/${table}`, root);
  for (const [name, value] of Object.entries(query)) {
    if (!/^(select|id|student_id|batch_id|status|role|account_status|code|is_archived|order|limit|offset)$/.test(name)) {
      throw new Error(`Query parameter is not permitted: ${name}`);
    }
    url.searchParams.set(name, value);
  }
  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new SupabaseReadError(response.status, `Supabase read rejected (HTTP ${response.status})`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new SupabaseReadError(502, "Invalid Supabase response shape");
  return rows as T[];
}
