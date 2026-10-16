import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY)");
}

/**
 * Admin client — bypasses RLS entirely. Only used for trusted, backend-only
 * operations (e.g. writing blockchain confirmation status from a chain
 * listener, or the nonce table which has no user context yet).
 */
export const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * Per-request, RLS-scoped client. Pass the Supabase-compatible JWT minted
 * in middleware/auth.ts (which embeds app_user_id + app_role as custom
 * claims). Every query made with this client is filtered by the RLS
 * policies in db/migrations/004_rls_policies.sql — this is the enforcement
 * boundary, not application-level `if` checks.
 */
export function supabaseForRequest(userJwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
}
