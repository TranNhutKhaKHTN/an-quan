import "server-only";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { MoveRow, PlayerRow, RoomRow, SessionRow } from "../types";
import { ServiceError, StaleVersionError, type ServiceErrorCode } from "./errors";
import type { CommitMoveArgs, NewRoom, Store } from "./store";

const DOMAIN_ERRORS = new Set<ServiceErrorCode>([
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_NOT_JOINABLE",
  "NOT_A_MEMBER",
  "BAD_STATUS",
  "NOT_ENOUGH_PLAYERS",
]);

/** Postgres exceptions raised by the RPC functions carry the domain code as their message. */
function fail(error: PostgrestError): never {
  const msg = error.message;
  if (msg === "STALE_VERSION") throw new StaleVersionError();
  if (msg === "ROOM_NOT_IN_LOBBY") throw new ServiceError("BAD_STATUS", msg);
  if (msg === "ALREADY_MEMBER") throw new ServiceError("BAD_STATUS", msg);
  if (DOMAIN_ERRORS.has(msg as ServiceErrorCode)) throw new ServiceError(msg as ServiceErrorCode);
  console.error("[supabase]", error);
  throw new ServiceError("INTERNAL", "Database error");
}

const isTransient = (e: unknown) =>
  e instanceof Error && /fetch failed|ECONNRESET|ETIMEDOUT|network|502|503|504/i.test(e.message);

/** Retries reads on transient network/gateway failures (Vercel cold paths, Supabase blips). */
async function retrying<T>(fn: () => PromiseLike<{ data: T; error: PostgrestError | null }>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { data, error } = await fn();
      if (error) {
        if (attempt < tries && isTransient(error)) {
          await new Promise((r) => setTimeout(r, 100 * attempt));
          continue;
        }
        fail(error);
      }
      return data;
    } catch (e) {
      if (attempt < tries && isTransient(e)) {
        await new Promise((r) => setTimeout(r, 100 * attempt));
        continue;
      }
      throw e;
    }
  }
}

export class SupabaseStore implements Store {
  constructor(private readonly db: SupabaseClient) {}

  findRoomByCode(code: string) {
    return retrying(() => this.db.from("game_rooms").select("*").eq("code", code).maybeSingle<RoomRow>());
  }
  findRoomByCreationKey(ownerId: string, key: string) {
    return retrying(() =>
      this.db.from("game_rooms").select("*").eq("owner_id", ownerId).eq("creation_key", key).maybeSingle<RoomRow>(),
    );
  }
  async insertRoom(n: NewRoom) {
    const { data, error } = await this.db
      .from("game_rooms")
      .insert({
        code: n.code,
        owner_id: n.ownerId,
        player_limit: n.playerLimit,
        is_public: n.isPublic,
        settings: n.settings,
        creation_key: n.creationKey,
      })
      .select("*")
      .single<RoomRow>();
    if (error) {
      if (error.code === "23505") throw new Error("CODE_TAKEN");
      fail(error);
    }
    return data!;
  }
  async listPublicRooms(limit: number) {
    const rooms = (await retrying(() =>
      this.db
        .from("game_rooms")
        .select("*")
        .eq("is_public", true)
        .eq("status", "lobby")
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<RoomRow[]>(),
    )) ?? [];
    if (!rooms.length) return [];
    const players = (await retrying(() =>
      this.db.from("game_players").select("*").in("room_id", rooms.map((r) => r.id)).returns<PlayerRow[]>(),
    )) ?? [];
    return rooms.map((room) => ({ room, players: players.filter((p) => p.room_id === room.id) }));
  }
  async upsertProfile(userId: string, name: string, avatar: string) {
    const { error } = await this.db.from("profiles").upsert({ id: userId, display_name: name, avatar });
    if (error) fail(error);
  }

  async listPlayers(roomId: string) {
    const rows = await retrying(() =>
      this.db.from("game_players").select("*").eq("room_id", roomId).returns<PlayerRow[]>(),
    );
    return rows ?? [];
  }
  async joinRoom(a: { roomId: string; userId: string; name: string; avatar: string; tokenHash: string }) {
    const { data, error } = await this.db.rpc("join_room", {
      p_room_id: a.roomId,
      p_user_id: a.userId,
      p_name: a.name,
      p_avatar: a.avatar,
      p_token_hash: a.tokenHash,
    });
    if (error) fail(error);
    return data as PlayerRow;
  }
  async leaveLobby(roomId: string, userId: string) {
    const { error } = await this.db.rpc("leave_lobby", { p_room_id: roomId, p_user_id: userId });
    if (error) fail(error);
  }
  async updatePlayer(roomId: string, userId: string, patch: Parameters<Store["updatePlayer"]>[2]) {
    const { error } = await this.db.from("game_players").update(patch).eq("room_id", roomId).eq("user_id", userId);
    if (error) fail(error);
  }
  async findPlayerByTokenHash(roomId: string, hash: string) {
    const secret = await retrying(() =>
      this.db.from("player_secrets").select("player_id").eq("token_hash", hash).maybeSingle<{ player_id: string }>(),
    );
    if (!secret) return null;
    return retrying(() =>
      this.db
        .from("game_players")
        .select("*")
        .eq("id", secret.player_id)
        .eq("room_id", roomId)
        .maybeSingle<PlayerRow>(),
    );
  }
  async rebindPlayer(playerId: string, newUserId: string) {
    const { error } = await this.db.rpc("rebind_player", { p_player_id: playerId, p_new_user_id: newUserId });
    if (error) fail(error);
  }

  getSession(roomId: string) {
    return retrying(() => this.db.from("game_sessions").select("*").eq("room_id", roomId).maybeSingle<SessionRow>());
  }
  async startRound(a: Parameters<Store["startRound"]>[0]) {
    const { data, error } = await this.db.rpc("start_round", {
      p_room_id: a.roomId,
      p_from_status: a.fromStatus,
      p_state: a.state,
      p_turn: a.state.turn,
      p_deadline: a.turnDeadline,
    });
    if (error) fail(error);
    return data as SessionRow;
  }
  async commitMove(a: CommitMoveArgs) {
    const { data, error } = await this.db.rpc("commit_move", {
      p_room_id: a.roomId,
      p_expected_version: a.expectedVersion,
      p_new_version: a.state.version,
      p_state: a.state,
      p_status: a.state.status === "finished" ? "finished" : "playing",
      p_turn: a.state.turn,
      p_deadline: a.turnDeadline,
      p_seat: a.seat,
      p_move: a.move,
      p_key: a.idempotencyKey,
      p_result: a.result,
    });
    if (error) fail(error);
    return { replayed: Boolean((data as { replayed?: boolean }).replayed) };
  }
  async getMoves(roomId: string, round: number) {
    const rows = await retrying(() =>
      this.db
        .from("game_moves")
        .select("room_id, round, version, seat, move, idempotency_key")
        .eq("room_id", roomId)
        .eq("round", round)
        .order("version")
        .returns<MoveRow[]>(),
    );
    return rows ?? [];
  }
  async hasMoveKey(roomId: string, key: string) {
    const rows = await retrying(() =>
      this.db.from("game_moves").select("version").eq("room_id", roomId).eq("idempotency_key", key).limit(1),
    );
    return (rows?.length ?? 0) > 0;
  }
  getResult(roomId: string, round: number) {
    return retrying(() =>
      this.db
        .from("game_results")
        .select("scores, winners, reason")
        .eq("room_id", roomId)
        .eq("round", round)
        .maybeSingle<{ scores: number[]; winners: number[]; reason: string }>(),
    );
  }
  async rateLimit(key: string, windowSeconds: number, max: number) {
    const { data, error } = await this.db.rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
    if (error) fail(error);
    return Boolean(data);
  }
}
