import type { GameState } from "@/features/game/engine";
import type { MoveRow, PlayerRow, RoomRow, RoomSettings, SessionRow, StoredMove } from "../types";

export interface NewRoom {
  code: string;
  ownerId: string;
  playerLimit: number;
  isPublic: boolean;
  settings: RoomSettings;
  creationKey: string | null;
}

export interface CommitMoveArgs {
  roomId: string;
  expectedVersion: number;
  state: GameState;
  turnDeadline: string | null;
  seat: number;
  move: StoredMove;
  idempotencyKey: string | null;
  result: { scores: number[]; winners: number[]; reason: string } | null;
}

/**
 * Persistence boundary. Every method that changes shared state must be atomic;
 * the Supabase implementation does that with the RPC functions in the migration.
 * Stores signal domain failures with ServiceError / StaleVersionError.
 */
export interface Store {
  findRoomByCode(code: string): Promise<RoomRow | null>;
  findRoomByCreationKey(ownerId: string, key: string): Promise<RoomRow | null>;
  /** Throws Error("CODE_TAKEN") when the room code is already in use. */
  insertRoom(room: NewRoom): Promise<RoomRow>;
  listPublicRooms(limit: number): Promise<{ room: RoomRow; players: PlayerRow[] }[]>;
  upsertProfile(userId: string, name: string, avatar: string): Promise<void>;

  listPlayers(roomId: string): Promise<PlayerRow[]>;
  /** Atomic: takes the lowest free seat; idempotent for an existing member (rotates the token). */
  joinRoom(args: { roomId: string; userId: string; name: string; avatar: string; tokenHash: string }): Promise<PlayerRow>;
  /** Atomic: removes the player, hands off ownership, closes empty rooms. */
  leaveLobby(roomId: string, userId: string): Promise<void>;
  updatePlayer(roomId: string, userId: string, patch: Partial<Pick<PlayerRow, "ready" | "wants_rematch" | "last_seen">>): Promise<void>;
  findPlayerByTokenHash(roomId: string, hash: string): Promise<PlayerRow | null>;
  rebindPlayer(playerId: string, newUserId: string): Promise<void>;

  getSession(roomId: string): Promise<SessionRow | null>;
  /** Atomic: first game (fromStatus "lobby") or rematch ("finished"). */
  startRound(args: {
    roomId: string;
    fromStatus: "lobby" | "finished";
    state: GameState;
    turnDeadline: string | null;
  }): Promise<SessionRow>;
  /** Atomic compare-and-set on version. Throws StaleVersionError. */
  commitMove(args: CommitMoveArgs): Promise<{ replayed: boolean }>;
  getMoves(roomId: string, round: number): Promise<MoveRow[]>;
  hasMoveKey(roomId: string, key: string): Promise<boolean>;
  getResult(roomId: string, round: number): Promise<{ scores: number[]; winners: number[]; reason: string } | null>;

  rateLimit(key: string, windowSeconds: number, max: number): Promise<boolean>;
}
