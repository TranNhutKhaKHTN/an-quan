"use client";

import { api, newIdempotencyKey } from "@/lib/api/client";
import type { Direction } from "@/features/game/engine";
import type { JoinResponse, PublicRoomListItem, RoomSnapshot } from "../types";

const room = (code: string) => `/api/rooms/${code}`;
const game = (code: string) => `/api/games/${code}`;

export const roomApi = {
  create: (input: {
    playerLimit: number;
    displayName: string;
    avatar: string;
    isPublic: boolean;
    turnSeconds: number;
    idempotencyKey?: string;
  }) => api<JoinResponse & { code: string }>("/api/rooms", { body: { idempotencyKey: newIdempotencyKey(), ...input } }),
  listPublic: () => api<PublicRoomListItem[]>("/api/rooms"),
  get: (code: string) => api<RoomSnapshot>(room(code)),
  join: (code: string, profile: { displayName: string; avatar: string }) =>
    api<JoinResponse>(`${room(code)}/join`, { body: profile }),
  leave: (code: string) => api<{ snapshot: RoomSnapshot | null }>(`${room(code)}/leave`, { body: {} }),
  ready: (code: string, ready: boolean) => api<RoomSnapshot>(`${room(code)}/ready`, { body: { ready } }),
  start: (code: string) => api<RoomSnapshot>(`${room(code)}/start`, { body: {} }),

  move: (code: string, m: { cell: number; direction: Direction; expectedVersion: number; idempotencyKey: string }) =>
    api<RoomSnapshot>(`${game(code)}/moves`, { body: m }),
  surrender: (code: string) => api<RoomSnapshot>(`${game(code)}/surrender`, { body: {} }),
  rematch: (code: string) => api<RoomSnapshot>(`${game(code)}/rematch`, { body: {} }),
  timeout: (code: string, expectedVersion: number) =>
    api<RoomSnapshot>(`${game(code)}/timeout`, { body: { expectedVersion } }),
  reconnect: (code: string, sessionToken?: string) =>
    api<RoomSnapshot & { reclaimed: boolean }>(`${game(code)}/reconnect`, { body: sessionToken ? { sessionToken } : {} }),
};
