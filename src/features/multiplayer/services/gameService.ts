import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  EngineError,
  type EndReason,
  applyMove,
  createGame,
  defaultMove,
  scores,
  surrender as engineSurrender,
  type Direction,
  type MoveResult,
  type PlayerCount,
} from "@/features/game/engine";
import type {
  JoinResponse,
  PublicRoomListItem,
  RoomRow,
  RoomSnapshot,
  RoomSettings,
  SessionRow,
  StoredMove,
} from "../types";
import { ServiceError, StaleVersionError } from "./errors";
import type { Store } from "./store";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
// heartbeat runs about once a minute; live status comes from realtime presence
const ONLINE_WINDOW_MS = 150_000;
const TIMEOUT_GRACE_MS = 1_000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("hex");
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

export interface CreateRoomInput {
  playerLimit: number;
  displayName: string;
  avatar: string;
  isPublic: boolean;
  turnSeconds: number;
  idempotencyKey?: string;
}

export interface MoveInput {
  cell: number;
  direction: Direction;
  expectedVersion: number;
  idempotencyKey?: string;
}

export class GameService {
  constructor(
    private readonly store: Store,
    private readonly now: () => number = Date.now,
  ) {}

  /* ------------------------------------------------------------- helpers */

  private async limit(key: string, windowSeconds: number, max: number) {
    if (!(await this.store.rateLimit(key, windowSeconds, max)))
      throw new ServiceError("RATE_LIMITED", "Too many requests, slow down.");
  }

  private async room(code: string): Promise<RoomRow> {
    const room = await this.store.findRoomByCode(code.toUpperCase());
    if (!room || room.status === "closed") throw new ServiceError("ROOM_NOT_FOUND");
    return room;
  }

  private async member(userId: string, code: string) {
    const room = await this.room(code);
    const players = await this.store.listPlayers(room.id);
    const me = players.find((p) => p.user_id === userId);
    if (!me) throw new ServiceError("NOT_A_MEMBER");
    return { room, players, me };
  }

  private deadline(room: RoomRow): string | null {
    const s = room.settings?.turnSeconds ?? 0;
    return s > 0 ? new Date(this.now() + s * 1000).toISOString() : null;
  }

  async snapshot(userId: string | null, code: string): Promise<RoomSnapshot> {
    const room = await this.room(code);
    const players = await this.store.listPlayers(room.id);
    const me = userId ? players.find((p) => p.user_id === userId) : undefined;
    const now = this.now();

    let session: RoomSnapshot["session"] = null;
    let moves: RoomSnapshot["moves"] = [];
    let result: RoomSnapshot["result"] = null;
    if (me) {
      const s = await this.store.getSession(room.id);
      if (s) {
        session = { round: s.round, version: s.version, state: s.state, turnDeadline: s.turn_deadline };
        moves = (await this.store.getMoves(room.id, s.round)).map((m) => ({
          version: m.version,
          seat: m.seat,
          move: m.move,
        }));
        if (s.status === "finished") {
          const r = await this.store.getResult(room.id, s.round);
          result = r && { scores: r.scores, winners: r.winners, reason: r.reason as EndReason };
        }
      }
    }

    return {
      room: {
        id: room.id,
        code: room.code,
        status: room.status,
        playerLimit: room.player_limit,
        isPublic: room.is_public,
        settings: room.settings,
      },
      players: players
        .sort((a, b) => a.seat - b.seat)
        .map((p) => ({
          seat: p.seat,
          name: p.display_name,
          avatar: p.avatar,
          ready: p.ready,
          wantsRematch: p.wants_rematch,
          online: now - Date.parse(p.last_seen) < ONLINE_WINDOW_MS,
          isOwner: p.user_id === room.owner_id,
        })),
      you: me ? { seat: me.seat, isOwner: me.user_id === room.owner_id } : null,
      session,
      moves,
      result,
      serverTime: new Date(now).toISOString(),
    };
  }

  /* --------------------------------------------------------------- rooms */

  async createRoom(userId: string, input: CreateRoomInput): Promise<JoinResponse & { code: string }> {
    await this.limit(`create:${userId}`, 60, 5);
    const settings: RoomSettings = { turnSeconds: input.turnSeconds };

    let room = input.idempotencyKey
      ? await this.store.findRoomByCreationKey(userId, input.idempotencyKey)
      : null;
    for (let attempt = 0; !room && attempt < 8; attempt++) {
      try {
        room = await this.store.insertRoom({
          code: newCode(),
          ownerId: userId,
          playerLimit: input.playerLimit,
          isPublic: input.isPublic,
          settings,
          creationKey: input.idempotencyKey ?? null,
        });
      } catch (e) {
        if (!(e instanceof Error) || e.message !== "CODE_TAKEN") throw e;
        // a concurrent retry may have created it under the same key
        room = input.idempotencyKey ? await this.store.findRoomByCreationKey(userId, input.idempotencyKey) : null;
      }
    }
    if (!room) throw new ServiceError("INTERNAL", "Could not allocate a room code.");

    const sessionToken = newToken();
    await this.store.upsertProfile(userId, input.displayName, input.avatar);
    await this.store.joinRoom({
      roomId: room.id,
      userId,
      name: input.displayName,
      avatar: input.avatar,
      tokenHash: hashToken(sessionToken),
    });
    return { code: room.code, sessionToken, snapshot: await this.snapshot(userId, room.code) };
  }

  async listPublicRooms(): Promise<PublicRoomListItem[]> {
    const rows = await this.store.listPublicRooms(20);
    return rows
      .filter(({ room, players }) => players.length < room.player_limit)
      .map(({ room, players }) => {
        const host = players.find((p) => p.user_id === room.owner_id) ?? players[0];
        return {
          code: room.code,
          playerLimit: room.player_limit,
          playerCount: players.length,
          hostName: host?.display_name ?? "?",
          hostAvatar: host?.avatar ?? "🐯",
        };
      });
  }

  async join(userId: string, code: string, input: { displayName: string; avatar: string }): Promise<JoinResponse> {
    await this.limit(`join:${userId}`, 60, 20);
    const room = await this.room(code);
    const sessionToken = newToken();
    await this.store.upsertProfile(userId, input.displayName, input.avatar);
    await this.store.joinRoom({
      roomId: room.id,
      userId,
      name: input.displayName,
      avatar: input.avatar,
      tokenHash: hashToken(sessionToken),
    });
    return { sessionToken, snapshot: await this.snapshot(userId, room.code) };
  }

  async leave(userId: string, code: string): Promise<RoomSnapshot | null> {
    const { room, me } = await this.member(userId, code);
    if (room.status === "lobby") {
      await this.store.leaveLobby(room.id, userId);
      return null;
    }
    if (room.status === "playing") {
      const session = await this.requireSession(room.id);
      if (!session.state.eliminated[me.seat]) await this.doSurrender(room, session, me.seat);
    }
    return this.snapshot(userId, code);
  }

  async setReady(userId: string, code: string, ready: boolean): Promise<RoomSnapshot> {
    const { room, me } = await this.member(userId, code);
    if (room.status !== "lobby") throw new ServiceError("BAD_STATUS");
    if (me.user_id === room.owner_id) return this.snapshot(userId, code); // owner is always ready
    await this.store.updatePlayer(room.id, userId, { ready });
    return this.snapshot(userId, code);
  }

  async start(userId: string, code: string): Promise<RoomSnapshot> {
    const { room, players } = await this.member(userId, code);
    if (room.owner_id !== userId) throw new ServiceError("NOT_OWNER", "Only the host can start the game.");
    if (room.status !== "lobby") throw new ServiceError("BAD_STATUS");
    if (players.length !== room.player_limit)
      throw new ServiceError("NOT_ENOUGH_PLAYERS", `Waiting for ${room.player_limit - players.length} more player(s).`);
    if (players.some((p) => p.user_id !== room.owner_id && !p.ready)) throw new ServiceError("NOT_READY");
    await this.startRound(room, "lobby");
    return this.snapshot(userId, code);
  }

  private async startRound(room: RoomRow, fromStatus: "lobby" | "finished") {
    await this.store.startRound({
      roomId: room.id,
      fromStatus,
      state: createGame(room.player_limit as PlayerCount),
      turnDeadline: this.deadline(room),
    });
  }

  /* --------------------------------------------------------------- moves */

  private async requireSession(roomId: string): Promise<SessionRow> {
    const s = await this.store.getSession(roomId);
    if (!s) throw new ServiceError("GAME_NOT_FOUND");
    return s;
  }

  private async commit(
    room: RoomRow,
    session: SessionRow,
    result: MoveResult,
    seat: number,
    move: StoredMove,
    key: string | null,
  ) {
    const finished = result.state.status === "finished";
    await this.store.commitMove({
      roomId: room.id,
      expectedVersion: session.version,
      state: result.state,
      turnDeadline: finished ? null : this.deadline(room),
      seat,
      move,
      idempotencyKey: key,
      result: finished
        ? { scores: scores(result.state), winners: result.state.winners, reason: result.state.endReason! }
        : null,
    });
  }

  /** Runs `fn`, turning stale commits into 409s (or a success when it was our own retry). */
  private async guarded(room: RoomRow, key: string | null, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      if (e instanceof StaleVersionError) {
        if (key && (await this.store.hasMoveKey(room.id, key))) return;
        throw new ServiceError("STALE_VERSION", "The game changed, refresh and try again.");
      }
      throw e;
    }
  }

  private mapEngine(e: unknown): never {
    if (e instanceof EngineError) {
      if (e.code === "STALE_VERSION") throw new ServiceError("STALE_VERSION");
      if (e.code === "NOT_YOUR_TURN") throw new ServiceError("NOT_YOUR_TURN");
      if (e.code === "GAME_FINISHED") throw new ServiceError("BAD_STATUS", "The game is over.");
      throw new ServiceError("INVALID_MOVE", e.code);
    }
    throw e;
  }

  async submitMove(userId: string, code: string, input: MoveInput): Promise<RoomSnapshot> {
    await this.limit(`move:${userId}`, 60, 120);
    const { room, me } = await this.member(userId, code);
    const key = input.idempotencyKey ?? null;
    if (key && (await this.store.hasMoveKey(room.id, key))) return this.snapshot(userId, code);
    if (room.status !== "playing") throw new ServiceError("BAD_STATUS", "No game in progress.");

    const session = await this.requireSession(room.id);
    if (session.version !== input.expectedVersion) {
      // a retry of a request that is still in flight may arrive after the original committed
      if (key && (await this.store.hasMoveKey(room.id, key))) return this.snapshot(userId, code);
      throw new ServiceError("STALE_VERSION");
    }

    let result: MoveResult;
    try {
      result = applyMove(
        session.state,
        { seat: me.seat, cell: input.cell, direction: input.direction },
        input.expectedVersion,
      );
    } catch (e) {
      this.mapEngine(e);
    }
    await this.guarded(room, key, () =>
      this.commit(room, session, result, me.seat, { kind: "move", cell: input.cell, direction: input.direction }, key),
    );
    return this.snapshot(userId, code);
  }

  private async doSurrender(room: RoomRow, session: SessionRow, seat: number) {
    let result: MoveResult;
    try {
      result = engineSurrender(session.state, seat, session.version);
    } catch (e) {
      this.mapEngine(e);
    }
    const key = `surrender:${session.round}:${seat}`;
    await this.guarded(room, key, () => this.commit(room, session, result, seat, { kind: "surrender" }, key));
  }

  async surrender(userId: string, code: string): Promise<RoomSnapshot> {
    const { room, me } = await this.member(userId, code);
    if (room.status !== "playing") throw new ServiceError("BAD_STATUS", "No game in progress.");
    const session = await this.requireSession(room.id);
    await this.doSurrender(room, session, me.seat);
    return this.snapshot(userId, code);
  }

  /** Any member may trigger this once the turn deadline has passed; the key makes concurrent calls idempotent. */
  async timeout(userId: string, code: string, expectedVersion?: number): Promise<RoomSnapshot> {
    await this.limit(`timeout:${userId}`, 60, 30);
    const { room } = await this.member(userId, code);
    if (room.status !== "playing") return this.snapshot(userId, code);
    const session = await this.requireSession(room.id);
    // someone else already resolved the turn the caller was looking at
    if (expectedVersion !== undefined && session.version !== expectedVersion) return this.snapshot(userId, code);
    if (!session.turn_deadline || this.now() < Date.parse(session.turn_deadline) + TIMEOUT_GRACE_MS)
      throw new ServiceError("TOO_EARLY", "The turn has not timed out yet.");

    const move = defaultMove(session.state);
    if (!move) return this.snapshot(userId, code);
    let result: MoveResult;
    try {
      result = applyMove(session.state, move, session.version);
    } catch (e) {
      this.mapEngine(e);
    }
    const key = `timeout:${session.round}:${session.version}`;
    await this.guarded(room, key, () =>
      this.commit(room, session, result, move.seat, { kind: "timeout", cell: move.cell, direction: move.direction }, key),
    );
    return this.snapshot(userId, code);
  }

  /* -------------------------------------------------- rematch, reconnect */

  async rematch(userId: string, code: string): Promise<RoomSnapshot> {
    const { room } = await this.member(userId, code);
    if (room.status !== "finished") throw new ServiceError("BAD_STATUS", "The game is not over.");
    await this.store.updatePlayer(room.id, userId, { wants_rematch: true });
    // re-read after our write: a concurrent request from another player may have landed in between
    const fresh = await this.store.listPlayers(room.id);
    if (fresh.length === room.player_limit && fresh.every((p) => p.wants_rematch)) {
      try {
        await this.startRound(room, "finished");
      } catch (e) {
        // another player's request already restarted the game
        if (!(e instanceof ServiceError && e.code === "BAD_STATUS")) throw e;
      }
    }
    return this.snapshot(userId, code);
  }

  /**
   * Heartbeat for members; with `sessionToken` a returning player can also reclaim
   * their seat from a new anonymous identity.
   */
  async reconnect(userId: string, code: string, sessionToken?: string): Promise<RoomSnapshot & { reclaimed: boolean }> {
    await this.limit(`reconnect:${userId}`, 60, 60);
    const room = await this.room(code);
    const players = await this.store.listPlayers(room.id);
    const mine = players.find((p) => p.user_id === userId);
    let reclaimed = false;
    if (!mine) {
      if (!sessionToken) throw new ServiceError("NOT_A_MEMBER");
      const owner = await this.store.findPlayerByTokenHash(room.id, hashToken(sessionToken));
      if (!owner) throw new ServiceError("INVALID_TOKEN");
      await this.store.rebindPlayer(owner.id, userId);
      reclaimed = true;
    }
    await this.store.updatePlayer(room.id, userId, { last_seen: new Date(this.now()).toISOString() });
    return { ...(await this.snapshot(userId, code)), reclaimed };
  }
}
