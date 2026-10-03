"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "./env";

let client: SupabaseClient | undefined;

/** Browser client (anon key + the user's own JWT, so RLS applies). */
export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    const env = publicEnv();
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "aq-auth" },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}
