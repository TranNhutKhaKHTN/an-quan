import { beforeEach, describe, expect, it } from "vitest";
import { legalMoves, type GameState } from "@/features/game/engine";
import { GameService } from "@/features/multiplayer/services/gameService";
import { ServiceError } from "@/features/multiplayer/services/errors";
import type { RoomSnapshot } from "@/features/multiplayer/types";
import { MemoryStore } from "../helpers/memoryStore";

const u = (n: number) => `user-${n}`;
const profile = (n: number) => ({ displayName: `P${n}`, avatar: "🐯" as const });

async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ServiceError);
    expect((e as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`expected ServiceError ${code}`);
}

let clock: number;
let store: MemoryStore;
let svc: GameService;

beforeEach(() => {
  clock = Date.parse("2026-10-03T10:00:00Z");
  store = new MemoryStore();
  store.now = () => clock;
  svc = new GameService(store, () => clock);
});

/** Creates a full room and starts the game. Returns the room code and each user's id. */
async function startedRoom(limit: 2 | 3 = 2, turnSeconds = 0) {
  const created = await svc.createRoom(u(1), { playerLimit: limit, ...profile(1), isPublic: false, turnSeconds });
  const code = created.code;
  for (let i = 2; i <= limit; i++) {
    await svc.join(u(i), code, profile(i));
    await svc.setReady(u(i), code, true);
  }
  await svc.start(u(1), code);
  return { code, created };
}

/** The user (1..n) whose seat is on turn. */
async function mover(code: string, limit: number) {
  for (let i = 1; i <= limit; i++) {
    const s = await svc.snapshot(u(i), code);
    if (s.session!.state.turn === s.you!.seat && s.session!.state.status === "playing") return { user: u(i), snap: s };
  }
  throw new Error("no mover");
}

describe("room creation", () => {
  it("creates a room with the creator seated as ready host and returns a secret token once", async () => {
    const r = await svc.createRoom(u(1), { playerLimit: 3, ...profile(1), isPublic: true, turnSeconds: 30 });
    expect(r.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(r.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(r.snapshot.you).toEqual({ seat: 0, isOwner: true });
    expect(r.snapshot.room).toMatchObject({ status: "lobby", playerLimit: 3, isPublic: true });
    expect(r.snapshot.players[0]).toMatchObject({ seat: 0, ready: true, isOwner: true });
    // the DB only stores a hash
    expect(JSON.stringify(store.players)).not.toContain(r.sessionToken);
  });

  it("is idempotent for the same key and does not create duplicates", async () => {
    const input = { playerLimit: 2, ...profile(1), isPublic: false, turnSeconds: 0, idempotencyKey: "create-key-1" };
    const a = await svc.createRoom(u(1), input);
    const b = await svc.createRoom(u(1), input);
    expect(b.code).toBe(a.code);
    expect(store.rooms).toHaveLength(1);
    expect(store.players).toHaveLength(1);
  });

  it("rate-limits room creation", async () => {
    for (let i = 0; i < 5; i++) await svc.createRoom(u(1), { playerLimit: 2, ...profile(1), isPublic: false, turnSeconds: 0 });
    await expectCode(
      svc.createRoom(u(1), { playerLimit: 2, ...profile(1), isPublic: false, turnSeconds: 0 }),
      "RATE_LIMITED",
    );
    clock += 61_000;
    await svc.createRoom(u(1), { playerLimit: 2, ...profile(1), isPublic: false, turnSeconds: 0 });
  });

  it("lists only public rooms that still have space", async () => {
    await svc.createRoom(u(1), { playerLimit: 2, ...profile(1), isPublic: true, turnSeconds: 0 });
    await svc.createRoom(u(2), { playerLimit: 2, ...profile(2), isPublic: false, turnSeconds: 0 });
    const full = await svc.createRoom(u(3), { playerLimit: 2, ...profile(3), isPublic: true, turnSeconds: 0 });
    await svc.join(u(4), full.code, profile(4));
    const list = await svc.listPublicRooms();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ playerLimit: 2, playerCount: 1, hostName: "P1" });
  });
});

describe("joining", () => {
  it("assigns seats in order, is idempotent and rejects when the room is full", async () => {
    const { code } = await svc.createRoom(u(1), { playerLimit: 2, ...profile(1), isPublic: false, turnSeconds: 0 });
    const j = await svc.join(u(2), code, profile(2));
    expect(j.snapshot.you?.seat).toBe(1);
    expect((await svc.join(u(2), code, { displayName: "Renamed", avatar: "🐲" })).snapshot.you?.seat).toBe(1);
    expect(store.players).toHaveLength(2);
    await expectCode(svc.join(u(3), code, profile(3)), "ROOM_FULL");
  });

  it("accepts lowercase codes and rejects unknown rooms", async () => {
    const { code } = await svc.createRoom(u(1), { playerLimit: 2, ...profile(1), isPublic: false, turnSeconds: 0 });
    await svc.join(u(2), code.toLowerCase(), profile(2));
    await expectCode(svc.join(u(3), "ZZZZZZ", profile(3)), "ROOM_NOT_FOUND");
  });

  it("two players racing for the last seat: exactly one wins", async () => {
    const { code } = await svc.createRoom(u(1), { playerLimit: 2, ...profile(1), isPublic: false, turnSeconds: 0 });
    const results = await Promise.allSettled([svc.join(u(2), code, profile(2)), svc.join(u(3), code, profile(3))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(store.players).toHaveLength(2);
  });

  it("cannot join once the game has started", async () => {
    const { code } = await startedRoom(2);
    await expectCode(svc.join(u(9), code, profile(9)), "ROOM_NOT_JOINABLE");
  });

  it("non-members only see public room info, never the game or user ids", async () => {
    const { code } = await startedRoom(2);
    const snap = await svc.snapshot(u(9), code);
    expect(snap.you).toBeNull();
    expect(snap.session).toBeNull();
    expect(snap.moves).toEqual([]);
    const anon = await svc.snapshot(null, code);
    expect(JSON.stringify(anon)).not.toMatch(/user-\d/);
  });
});

describe("lobby: ready, start, leave", () => {
  it("only the host can start, and only when full and ready", async () => {
    const { code } = await svc.createRoom(u(1), { playerLimit: 3, ...profile(1), isPublic: false, turnSeconds: 0 });
    await expectCode(svc.start(u(1), code), "NOT_ENOUGH_PLAYERS");
    await svc.join(u(2), code, profile(2));
    await svc.join(u(3), code, profile(3));
    await expectCode(svc.start(u(2), code), "NOT_OWNER");
    await expectCode(svc.start(u(1), code), "NOT_READY");
    await svc.setReady(u(2), code, true);
    await svc.setReady(u(3), code, true);
    await expectCode(svc.start(u(9), code), "NOT_A_MEMBER");
    const snap = await svc.start(u(1), code);
    expect(snap.room.status).toBe("playing");
    expect(snap.session).toMatchObject({ round: 1, version: 0 });
    expect(snap.session!.state.config.playerCount).toBe(3);
    await expectCode(svc.start(u(1), code), "BAD_STATUS");
    await expectCode(svc.setReady(u(2), code, false), "BAD_STATUS");
  });

  it("host leaving hands the room over; the last leaver closes it", async () => {
    const { code } = await svc.createRoom(u(1), { playerLimit: 2, ...profile(1), isPublic: false, turnSeconds: 0 });
    await svc.join(u(2), code, profile(2));
    await svc.leave(u(1), code);
    const snap = await svc.snapshot(u(2), code);
    expect(snap.you).toEqual({ seat: 1, isOwner: true });
    expect(snap.players).toHaveLength(1);
    await svc.leave(u(2), code);
    await expectCode(svc.snapshot(null, code), "ROOM_NOT_FOUND");
  });

  it("a freed seat can be taken by a new player and seats compact when starting", async () => {
    const { code } = await svc.createRoom(u(1), { playerLimit: 3, ...profile(1), isPublic: false, turnSeconds: 0 });
    await svc.join(u(2), code, profile(2));
    await svc.join(u(3), code, profile(3));
    await svc.leave(u(2), code);
    await svc.join(u(4), code, profile(4));
    expect((await svc.snapshot(u(4), code)).you?.seat).toBe(1);
  });
});

describe("moves", () => {
  it("applies a legal move, bumps the version and records history", async () => {
    const { code } = await startedRoom(2);
    const { user, snap } = await mover(code, 2);
    const m = legalMoves(snap.session!.state)[0];
    const after = await svc.submitMove(user, code, { cell: m.cell, direction: m.direction, expectedVersion: 0 });
    expect(after.session!.version).toBe(1);
    expect(after.session!.state.turn).toBe(1);
    expect(after.moves).toEqual([{ version: 1, seat: 0, move: { kind: "move", cell: m.cell, direction: m.direction } }]);
  });

  it("rejects out-of-turn, stale, invalid and non-member moves", async () => {
    const { code } = await startedRoom(2);
    await expectCode(svc.submitMove(u(2), code, { cell: 7, direction: 1, expectedVersion: 0 }), "NOT_YOUR_TURN");
    await expectCode(svc.submitMove(u(1), code, { cell: 1, direction: 1, expectedVersion: 5 }), "STALE_VERSION");
    await expectCode(svc.submitMove(u(1), code, { cell: 7, direction: 1, expectedVersion: 0 }), "INVALID_MOVE"); // opponent's house
    await expectCode(svc.submitMove(u(1), code, { cell: 0, direction: 1, expectedVersion: 0 }), "INVALID_MOVE"); // quan cell
    await expectCode(svc.submitMove(u(9), code, { cell: 1, direction: 1, expectedVersion: 0 }), "NOT_A_MEMBER");
    expect(store.moves).toHaveLength(0);
  });

  it("clients can't forge scores or state: only (cell, direction) is accepted and the server recomputes", async () => {
    const { code } = await startedRoom(2);
    const forged = { cell: 1, direction: 1, expectedVersion: 0, captured: [{ dan: 99, quan: 9 }], turn: 0 };
    const snap = await svc.submitMove(u(1), code, forged as never);
    expect(snap.session!.state.captured[0].dan).toBeLessThan(99);
    expect(snap.session!.state.turn).toBe(1);
  });

  it("an idempotency key makes retries harmless (sequential and concurrent)", async () => {
    const { code } = await startedRoom(2);
    const input = { cell: 1, direction: 1 as const, expectedVersion: 0, idempotencyKey: "move-key-0001" };
    const [a, b] = await Promise.all([svc.submitMove(u(1), code, input), svc.submitMove(u(1), code, input)]);
    expect(a.session!.version).toBe(1);
    expect(b.session!.version).toBe(1);
    const again = await svc.submitMove(u(1), code, input);
    expect(again.session!.version).toBe(1);
    expect(store.moves).toHaveLength(1);
  });

  it("simultaneous different moves on the same version: exactly one is committed", async () => {
    const { code } = await startedRoom(2);
    const results = await Promise.allSettled([
      svc.submitMove(u(1), code, { cell: 1, direction: 1, expectedVersion: 0, idempotencyKey: "race-key-0001" }),
      svc.submitMove(u(1), code, { cell: 2, direction: -1, expectedVersion: 0, idempotencyKey: "race-key-0002" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(["STALE_VERSION", "NOT_YOUR_TURN"]).toContain((rejected.reason as ServiceError).code);
    expect(store.moves).toHaveLength(1);
  });

  it("rate-limits move submissions per user", async () => {
    const { code } = await startedRoom(2);
    let limited = false;
    for (let i = 0; i < 125 && !limited; i++) {
      try {
        await svc.submitMove(u(1), code, { cell: 99, direction: 1, expectedVersion: 0 });
      } catch (e) {
        limited = (e as ServiceError).code === "RATE_LIMITED";
      }
    }
    expect(limited).toBe(true);
  });
});

describe("a complete game", () => {
  it.each([2, 3] as const)("%i players play to the end; results are stored and moves are refused afterwards", async (n) => {
    const { code } = await startedRoom(n);
    let last: RoomSnapshot | undefined;
    for (let i = 0; i < 400; i++) {
      const { user, snap } = await (async () => {
        try {
          return await mover(code, n);
        } catch {
          return { user: "", snap: undefined as never };
        }
      })();
      if (!user) break;
      const state: GameState = snap.session!.state;
      const m = legalMoves(state)[i % legalMoves(state).length];
      last = await svc.submitMove(user, code, {
        cell: m.cell,
        direction: m.direction,
        expectedVersion: snap.session!.version,
        idempotencyKey: `game-move-${i.toString().padStart(4, "0")}`,
      });
      if (last.room.status === "finished") break;
    }
    expect(last?.room.status).toBe("finished");
    expect(last!.result!.winners.length).toBeGreaterThan(0);
    expect(last!.result!.scores).toHaveLength(n);
    expect(last!.moves.length).toBe(last!.session!.version);
    await expectCode(svc.submitMove(u(1), code, { cell: 1, direction: 1, expectedVersion: last!.session!.version }), "BAD_STATUS");
  });
});

describe("surrender", () => {
  it("2 players: surrendering ends the game and the other player wins", async () => {
    const { code } = await startedRoom(2);
    const snap = await svc.surrender(u(2), code); // surrendering is allowed off-turn
    expect(snap.room.status).toBe("finished");
    expect(snap.result).toMatchObject({ winners: [0], reason: "surrender" });
    await expectCode(svc.surrender(u(1), code), "BAD_STATUS");
  });

  it("3 players: the game continues and leaving mid-game counts as surrender", async () => {
    const { code } = await startedRoom(3);
    await svc.leave(u(1), code);
    const snap = await svc.snapshot(u(2), code);
    expect(snap.room.status).toBe("playing");
    expect(snap.session!.state.eliminated).toEqual([true, false, false]);
    expect(snap.session!.state.turn).toBe(1);
  });
});

describe("rematch", () => {
  it("restarts only when every player asks, with a fresh board and a new round", async () => {
    const { code } = await startedRoom(2);
    await expectCode(svc.rematch(u(1), code), "BAD_STATUS");
    await svc.surrender(u(2), code);
    const first = await svc.rematch(u(1), code);
    expect(first.room.status).toBe("finished");
    expect(first.players.find((p) => p.seat === 0)!.wantsRematch).toBe(true);
    const second = await svc.rematch(u(2), code);
    expect(second.room.status).toBe("playing");
    expect(second.session).toMatchObject({ round: 2, version: 0 });
    expect(second.moves).toEqual([]);
    expect(second.players.every((p) => !p.wantsRematch)).toBe(true);
    expect(second.result).toBeNull();
  });

  it("simultaneous rematch requests start exactly one new round", async () => {
    const { code } = await startedRoom(2);
    await svc.surrender(u(2), code);
    await Promise.all([svc.rematch(u(1), code), svc.rematch(u(2), code)]);
    expect(store.sessions[0].round).toBe(2);
  });
});

describe("presence and reconnection", () => {
  it("heartbeats keep a player online; silence marks them offline", async () => {
    const { code } = await startedRoom(2);
    await svc.reconnect(u(1), code);
    await svc.reconnect(u(2), code);
    clock += 30_000;
    await svc.reconnect(u(1), code);
    clock += 130_000; // user 2 silent for 160s
    const snap = await svc.snapshot(u(1), code);
    expect(snap.players.map((p) => p.online)).toEqual([true, false]);
  });

  it("a returning player reclaims their seat from a new identity using the session token", async () => {
    const { code, created } = await startedRoom(2);
    const snap = await svc.reconnect(u(99), code, created.sessionToken);
    expect(snap.reclaimed).toBe(true);
    expect(snap.you).toEqual({ seat: 0, isOwner: true });
    expect(snap.session).not.toBeNull();
    // the old identity lost the seat
    await expectCode(svc.reconnect(u(1), code), "NOT_A_MEMBER");
    // and the reclaimed identity can move
    const moved = await svc.submitMove(u(99), code, { cell: 1, direction: 1, expectedVersion: 0 });
    expect(moved.session!.version).toBe(1);
  });

  it("rejects wrong tokens, tokens from another room, and anonymous strangers", async () => {
    const { code } = await startedRoom(2);
    const other = await svc.createRoom(u(7), { playerLimit: 2, ...profile(7), isPublic: false, turnSeconds: 0 });
    await expectCode(svc.reconnect(u(50), code, "a".repeat(64)), "INVALID_TOKEN");
    await expectCode(svc.reconnect(u(50), code, other.sessionToken), "INVALID_TOKEN");
    await expectCode(svc.reconnect(u(50), code), "NOT_A_MEMBER");
  });

  it("an existing member's heartbeat ignores any token and keeps their own seat", async () => {
    const { code } = await startedRoom(2);
    const snap = await svc.reconnect(u(2), code, "b".repeat(64));
    expect(snap).toMatchObject({ reclaimed: false, you: { seat: 1 } });
  });
});

describe("turn timer", () => {
  it("refuses early timeouts, then plays the default move once, even under concurrent calls", async () => {
    const { code } = await startedRoom(2, 30);
    const snap = await svc.snapshot(u(1), code);
    expect(snap.session!.turnDeadline).toBe(new Date(clock + 30_000).toISOString());
    await expectCode(svc.timeout(u(2), code), "TOO_EARLY");
    clock += 32_000;
    const [a, b] = await Promise.all([svc.timeout(u(2), code, 0), svc.timeout(u(1), code, 0)]);
    expect(a.session!.version).toBe(1);
    expect(b.session!.version).toBe(1);
    expect(store.moves).toHaveLength(1);
    expect(store.moves[0].move.kind).toBe("timeout");
    expect(a.session!.state.turn).toBe(1);
    expect(a.session!.turnDeadline).toBe(new Date(clock + 30_000).toISOString());
  });

  it("is a no-op for rooms without a timer", async () => {
    const { code } = await startedRoom(2, 0);
    clock += 999_000;
    await expectCode(svc.timeout(u(1), code), "TOO_EARLY");
  });
});
