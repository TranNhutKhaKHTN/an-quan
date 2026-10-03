"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { clearToken, loadToken } from "../storage";
import { roomApi } from "../services/roomApi";
import { subscribeRoom, type ConnectionState } from "../services/realtime";
import type { RoomSnapshot } from "../types";

export type RoomLoad = "loading" | "ready" | "notfound" | "error";

const HEARTBEAT_MS = 60_000;

/**
 * Loads a room and keeps it fresh:
 *  - realtime events (postgres changes) only trigger a re-read of the authoritative snapshot;
 *  - a slow heartbeat refreshes presence data and recovers from missed events;
 *  - the snapshot is re-read after reconnects, tab focus and coming back online.
 */
export function useRoom(code: string) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [load, setLoad] = useState<RoomLoad>("loading");
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [presence, setPresence] = useState<Set<number> | null>(null);

  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const seq = useRef({ issued: 0, applied: 0 });
  const inFlight = useRef(false);
  const again = useRef(false);
  const clockOffset = useRef(0);

  const apply = useCallback((snap: RoomSnapshot) => {
    snapshotRef.current = snap;
    clockOffset.current = Date.parse(snap.serverTime) - Date.now();
    setSnapshot(snap);
    setLoad("ready");
    setError(null);
  }, []);

  /** Accepts a snapshot from any response, ignoring ones older than what we already show. */
  const accept = useCallback(
    (snap: RoomSnapshot) => {
      const cur = snapshotRef.current?.session;
      const next = snap.session;
      if (cur && next && next.round === cur.round && next.version < cur.version) return;
      apply(snap);
    },
    [apply],
  );

  const readOnce = useCallback(async () => {
    const id = ++seq.current.issued;
    try {
      let snap = await roomApi.get(code);
      // not in the room (e.g. new browser): try to reclaim the seat with the saved session token
      if (!snap.you) {
        const token = loadToken(code);
        if (token) {
          try {
            snap = await roomApi.reconnect(code, token);
          } catch (e) {
            if (e instanceof ApiError && e.code === "INVALID_TOKEN") clearToken(code);
          }
        }
      }
      if (id >= seq.current.applied) {
        seq.current.applied = id;
        accept(snap);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "ROOM_NOT_FOUND") setLoad("notfound");
      else if (!snapshotRef.current) {
        setLoad("error");
        setError(e instanceof Error ? e.message : "Lỗi không xác định");
      } else setError(e instanceof Error ? e.message : "Mất kết nối");
    }
  }, [code, accept]);

  /** Re-reads the authoritative snapshot; bursts of calls are coalesced into one extra read. */
  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        await readOnce();
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, [readOnce]);

  // initial load + refresh when the code changes
  useEffect(() => {
    snapshotRef.current = null;
    seq.current = { issued: 0, applied: 0 };
    void refresh();
  }, [refresh]);

  const roomId = snapshot?.room.id;
  const mySeat = snapshot?.you?.seat;
  const isMember = mySeat !== undefined;

  // realtime + presence, only while we are a member of the room
  useEffect(() => {
    if (!roomId || !isMember || mySeat === undefined) return;
    const stop = subscribeRoom({
      roomId,
      seat: mySeat,
      onConnection: (state) => {
        setConnection(state);
        if (state === "connected") void refresh(); // catch up on anything missed while away
      },
      onPresence: setPresence,
      onChange: (table, payload) => {
        // our own/others' heartbeat only touches last_seen; skip the re-read for those
        if (table === "game_players" && payload.eventType === "UPDATE") {
          const next = payload.new as Record<string, unknown>;
          const known = snapshotRef.current?.players.find((p) => p.seat === next.seat);
          if (
            known &&
            known.ready === next.ready &&
            known.wantsRematch === next.wants_rematch &&
            known.name === next.display_name &&
            known.avatar === next.avatar
          )
            return;
        }
        void refresh();
      },
    });
    return stop;
  }, [roomId, isMember, mySeat, refresh]);

  // heartbeat
  useEffect(() => {
    if (!isMember) return;
    const beat = () =>
      roomApi
        .reconnect(code, loadToken(code) ?? undefined)
        .then(accept)
        .catch(() => {});
    const t = setInterval(beat, HEARTBEAT_MS);
    void beat();
    return () => clearInterval(t);
  }, [isMember, code, accept]);

  // recover after the tab was hidden or the network dropped
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", () => setConnection("reconnecting"));
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  return {
    snapshot,
    load,
    error,
    connection,
    presence,
    refresh,
    accept,
    /** Server time estimate (ms epoch), for countdowns. */
    serverNow: () => Date.now() + clockOffset.current,
  };
}
