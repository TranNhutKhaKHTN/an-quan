import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "./env";

let client: SupabaseClient | undefined;

/** Service-role client. Server only: it bypasses RLS. */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    client = createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
