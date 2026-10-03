import type { Direction, GameState, EndReason } from "@/features/game/engine";

export type RoomStatus = "lobby" | "playing" | "finished" | "closed";

export interface RoomSettings {
  /** Seconds per turn; 0 disables the timer. */
  turnSeconds: number;
}

/* ---- database rows (server only) ---- */

export interface RoomRow {
  id: string;
  code: string;
  owner_id: string;
  player_limit: number;
  status: RoomStatus;
  is_public: boolean;
  settings: RoomSettings;
  creation_key: string | null;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  user_id: string;
  seat: number;
  display_name: string;
  avatar: string;
  ready: boolean;
  wants_rematch: boolean;
  last_seen: string;
}

export interface SessionRow {
  id: string;
  room_id: string;
  round: number;
  state: GameState;
  version: number;
  turn: number;
  status: "playing" | "finished";
  turn_deadline: string | null;
}

export type StoredMove =
  | { kind: "move"; cell: number; direction: Direction }
  | { kind: "timeout"; cell: number; direction: Direction }
  | { kind: "surrender" };

export interface MoveRow {
  room_id: string;
  round: number;
  version: number;
  seat: number;
  move: StoredMove;
  idempotency_key: string | null;
}

/* ---- DTOs sent to browsers (never contain user ids or tokens) ---- */

export interface PublicPlayer {
  seat: number;
  name: string;
  avatar: string;
  ready: boolean;
  wantsRematch: boolean;
  online: boolean;
  isOwner: boolean;
}

export interface PublicMove {
  version: number;
  seat: number;
  move: StoredMove;
}

export interface RoomSnapshot {
  room: {
    /** Room uuid, used to scope the realtime subscription (RLS still applies). */
    id: string;
    code: string;
    status: RoomStatus;
    playerLimit: number;
    isPublic: boolean;
    settings: RoomSettings;
  };
  players: PublicPlayer[];
  /** The caller's seat, or null when they are not in the room. */
  you: { seat: number; isOwner: boolean } | null;
  /** Only sent to members. */
  session: {
    round: number;
    version: number;
    state: GameState;
    turnDeadline: string | null;
  } | null;
  /** Moves of the current round, only sent to members. */
  moves: PublicMove[];
  result: { scores: number[]; winners: number[]; reason: EndReason } | null;
  serverTime: string;
}

export interface JoinResponse {
  snapshot: RoomSnapshot;
  /** Secret used to reclaim this seat later; shown once. */
  sessionToken: string;
}

export interface PublicRoomListItem {
  code: string;
  playerLimit: number;
  playerCount: number;
  hostName: string;
  hostAvatar: string;
}
