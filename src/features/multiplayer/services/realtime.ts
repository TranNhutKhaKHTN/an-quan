"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type ConnectionState = "connecting" | "connected" | "reconnecting";

export interface RoomChannelOptions {
  roomId: string;
  seat: number;
  /** A committed change happened. Clients re-read the authoritative state from the API. */
  onChange: (table: string, payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onPresence: (seats: Set<number>) => void;
  onConnection: (state: ConnectionState) => void;
}

const TABLES = ["game_rooms", "game_players", "game_sessions", "game_moves", "game_results"] as const;

/**
 * One channel per room: Postgres changes (RLS-filtered, so only members get events)
 * plus presence. Events are only hints; the API is the source of truth.
 * Returns an unsubscribe function.
 */
export function subscribeRoom(o: RoomChannelOptions): () => void {
  const sb = supabaseBrowser();
  const channel = sb.channel(`room:${o.roomId}`, { config: { presence: { key: String(o.seat) } } });

  for (const table of TABLES) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: table === "game_rooms" ? `id=eq.${o.roomId}` : `room_id=eq.${o.roomId}` },
      (payload) => o.onChange(table, payload),
    );
  }
  channel.on("presence", { event: "sync" }, () => {
    o.onPresence(new Set(Object.keys(channel.presenceState()).map(Number)));
  });

  o.onConnection("connecting");
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      o.onConnection("connected");
      void channel.track({ seat: o.seat, at: Date.now() });
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      o.onConnection("reconnecting"); // supabase-js retries on its own
    }
  });

  return () => {
    void sb.removeChannel(channel);
  };
}
