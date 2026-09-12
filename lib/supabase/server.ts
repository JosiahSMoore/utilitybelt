import { createClient } from "@supabase/supabase-js";

// Server-only client using the service role key. Never import this from a
// "use client" file — the service role key must never reach the browser.
// This app is single-user with no auth, so RLS is enabled with no policies
// (see supabase/schema.sql) and this key is the only way in.
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
