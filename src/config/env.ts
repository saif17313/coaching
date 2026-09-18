const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"] as const;

export function getServerEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  return {
    SUPABASE_URL: process.env.SUPABASE_URL as string,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY as string,
  };
}
