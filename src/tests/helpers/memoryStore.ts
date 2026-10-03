import { randomUUID } from "node:crypto";
import { ServiceError, StaleVersionError } from "@/features/multiplayer/services/errors";
import type { CommitMoveArgs, NewRoom, Store } from "@/features/multiplayer/services/store";
import type { MoveRow, PlayerRow, RoomRow, SessionRow } from "@/features/multiplayer/types";

/**
 * Test double for the Supabase store. It mirrors the semantics of the SQL RPC
 * functions (seat allocation, version compare-and-set, idempotent moves, ...).
 * Never use it to hold real game state: it lives in one process's memory.
 */
export class MemoryStore implements Store {
  rooms: RoomRow[] = [];
  players: (PlayerRow & { token_hash: string })[] = [];
  sessions: SessionRow[] = [];
  moves: MoveRow[] = [];
  results: { room_id: string; round: number; scores: number[]; winners: number[]; reason: string }[] = [];
  limits = new Map<string, { start: number; count: number }>();
  now = () => Date.now();

  async findRoomByCode(code: string) {
    return this.rooms.find((r) => r.code === code) ?? null;
  }
  async findRoomByCreationKey(ownerId: string, key: string) {
    return this.rooms.find((r) => r.owner_id === ownerId && r.creation_key === key) ?? null;
  }
  async insertRoom(n: NewRoom) {
    if (this.rooms.some((r) => r.code === n.code)) throw new Error("CODE_TAKEN");
    if (n.creationKey && this.rooms.some((r) => r.owner_id === n.ownerId && r.creation_key === n.creationKey))
      throw new Error("CODE_TAKEN");
    const room: RoomRow = {
      id: randomUUID(),
      code: n.code,
      owner_id: n.ownerId,
      player_limit: n.playerLimit,
      status: "lobby",
      is_public: n.isPublic,
      settings: n.settings,
      creation_key: n.creationKey,
      created_at: new Date(this.now()).toISOString(),
    };
    this.rooms.push(room);
    return room;
  }
  async listPublicRooms(limit: number) {
    return this.rooms
      .filter((r) => r.is_public && r.status === "lobby")
      .slice(0, limit)
      .map((room) => ({ room, players: this.players.filter((p) => p.room_id === room.id) }));
  }
  async upsertProfile() {}

  async listPlayers(roomId: string) {
    return this.players.filter((p) => p.room_id === roomId).map((p) => ({ ...p }));
  }
  async joinRoom(a: { roomId: string; userId: string; name: string; avatar: string; tokenHash: string }) {
    const room = this.rooms.find((r) => r.id === a.roomId);
    if (!room) throw new ServiceError("ROOM_NOT_FOUND");
    const existing = this.players.find((p) => p.room_id === a.roomId && p.user_id === a.userId);
    if (existing) {
      Object.assign(existing, { display_name: a.name, avatar: a.avatar, token_hash: a.tokenHash });
      return existing;
    }
    if (room.status !== "lobby") throw new ServiceError("ROOM_NOT_JOINABLE");
    const taken = new Set(this.players.filter((p) => p.room_id === a.roomId).map((p) => p.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    if (seat >= room.player_limit) throw new ServiceError("ROOM_FULL");
    const p = {
      id: randomUUID(),
      room_id: a.roomId,
      user_id: a.userId,
      seat,
      display_name: a.name,
      avatar: a.avatar,
      ready: a.userId === room.owner_id,
      wants_rematch: false,
      last_seen: new Date(this.now()).toISOString(),
      token_hash: a.tokenHash,
    };
    this.players.push(p);
    return p;
  }
  async leaveLobby(roomId: string, userId: string) {
    const room = this.rooms.find((r) => r.id === roomId)!;
    if (room.status !== "lobby") throw new ServiceError("BAD_STATUS");
    const i = this.players.findIndex((p) => p.room_id === roomId && p.user_id === userId);
    if (i < 0) throw new ServiceError("NOT_A_MEMBER");
    this.players.splice(i, 1);
    const rest = this.players.filter((p) => p.room_id === roomId).sort((a, b) => a.seat - b.seat);
    if (!rest.length) room.status = "closed";
    else if (room.owner_id === userId) {
      room.owner_id = rest[0].user_id;
      rest[0].ready = true;
    }
  }
  async updatePlayer(roomId: string, userId: string, patch: Partial<PlayerRow>) {
    const p = this.players.find((x) => x.room_id === roomId && x.user_id === userId);
    if (p) Object.assign(p, patch);
  }
  async findPlayerByTokenHash(roomId: string, hash: string) {
    return this.players.find((p) => p.room_id === roomId && p.token_hash === hash) ?? null;
  }
  async rebindPlayer(playerId: string, newUserId: string) {
    const p = this.players.find((x) => x.id === playerId)!;
    if (this.players.some((x) => x.room_id === p.room_id && x.user_id === newUserId))
      throw new ServiceError("BAD_STATUS", "ALREADY_MEMBER");
    const room = this.rooms.find((r) => r.id === p.room_id)!;
    if (room.owner_id === p.user_id) room.owner_id = newUserId;
    p.user_id = newUserId;
  }

  async getSession(roomId: string) {
    return this.sessions.find((s) => s.room_id === roomId) ?? null;
  }
  async startRound(a: Parameters<Store["startRound"]>[0]) {
    const room = this.rooms.find((r) => r.id === a.roomId);
    if (!room) throw new ServiceError("ROOM_NOT_FOUND");
    if (room.status !== a.fromStatus) throw new ServiceError("BAD_STATUS");
    const ps = this.players.filter((p) => p.room_id === a.roomId).sort((x, y) => x.seat - y.seat);
    if (ps.length !== room.player_limit) throw new ServiceError("NOT_ENOUGH_PLAYERS");
    ps.forEach((p, i) => {
      p.seat = i;
      p.wants_rematch = false;
      p.ready = p.user_id === room.owner_id;
    });
    let s = this.sessions.find((x) => x.room_id === a.roomId);
    if (s) Object.assign(s, { round: s.round + 1, state: a.state, version: 0, turn: a.state.turn, status: "playing", turn_deadline: a.turnDeadline });
    else {
      s = { id: randomUUID(), room_id: a.roomId, round: 1, state: a.state, version: 0, turn: a.state.turn, status: "playing", turn_deadline: a.turnDeadline };
      this.sessions.push(s);
    }
    room.status = "playing";
    return s;
  }
  async commitMove(a: CommitMoveArgs) {
    if (a.idempotencyKey && this.moves.some((m) => m.room_id === a.roomId && m.idempotency_key === a.idempotencyKey))
      return { replayed: true };
    const s = this.sessions.find((x) => x.room_id === a.roomId);
    if (!s || s.version !== a.expectedVersion || s.status !== "playing") throw new StaleVersionError();
    Object.assign(s, {
      state: a.state,
      version: a.state.version,
      turn: a.state.turn,
      status: a.state.status === "finished" ? "finished" : "playing",
      turn_deadline: a.turnDeadline,
    });
    this.moves.push({ room_id: a.roomId, round: s.round, version: a.state.version, seat: a.seat, move: a.move, idempotency_key: a.idempotencyKey });
    if (a.result) {
      this.results.push({ room_id: a.roomId, round: s.round, ...a.result });
      this.rooms.find((r) => r.id === a.roomId)!.status = "finished";
    }
    return { replayed: false };
  }
  async getMoves(roomId: string, round: number) {
    return this.moves.filter((m) => m.room_id === roomId && m.round === round).sort((a, b) => a.version - b.version);
  }
  async hasMoveKey(roomId: string, key: string) {
    return this.moves.some((m) => m.room_id === roomId && m.idempotency_key === key);
  }
  async getResult(roomId: string, round: number) {
    return this.results.find((r) => r.room_id === roomId && r.round === round) ?? null;
  }
  async rateLimit(key: string, windowSeconds: number, max: number) {
    const now = this.now();
    const cur = this.limits.get(key);
    if (!cur || now - cur.start > windowSeconds * 1000) {
      this.limits.set(key, { start: now, count: 1 });
      return 1 <= max;
    }
    cur.count++;
    return cur.count <= max;
  }
}
