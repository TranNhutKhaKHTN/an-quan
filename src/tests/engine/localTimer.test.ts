import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMove } from "@/features/game/engine";
import { useLocalGame } from "@/features/game/store/localGameStore";
import { TURN_SECONDS } from "@/features/game/timer";

const game = () => useLocalGame.getState();

describe("turn clock (local / bot games)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
    game().setInstant(true); // skip animation waits
    game().start(2);
  });
  afterEach(() => vi.useRealTimers());

  it("is 10 seconds and starts with the game", () => {
    expect(TURN_SECONDS).toBe(10);
    expect(game().turnDeadline).toBe(Date.now() + 10_000);
  });

  it("restarts for the next player after a move, measured from when the move finished", async () => {
    vi.setSystemTime(Date.now() + 4_000);
    await game().playMove(defaultMove(game().state)!);
    expect(game().state.turn).toBe(1);
    expect(game().turnDeadline).toBe(Date.now() + 10_000);
  });

  it("has no clock while pieces are moving", async () => {
    game().select(1);
    const pending = game().play(1);
    expect(game().animating).toBe(true);
    expect(game().turnDeadline).toBeNull();
    await pending;
    expect(game().turnDeadline).not.toBeNull();
  });

  it("records a timeout move as such, and only that move", async () => {
    await game().playMove(defaultMove(game().state)!, "timeout");
    await game().playMove(defaultMove(game().state)!);
    expect(game().history.map((h) => h.kind)).toEqual(["timeout", "move"]);
  });

  it("is cleared when the game ends and restarts with a new game", async () => {
    game().surrender(0); // 2 players: ends the game
    expect(game().state.status).toBe("finished");
    expect(game().turnDeadline).toBeNull();
    vi.setSystemTime(Date.now() + 60_000);
    game().start(2);
    expect(game().turnDeadline).toBe(Date.now() + 10_000);
  });

  it("an off-turn surrender in a 3-player game does not reset the mover's clock", () => {
    game().start(3);
    const before = game().turnDeadline;
    vi.setSystemTime(Date.now() + 3_000);
    game().surrender(2); // seat 0 is on turn
    expect(game().state.turn).toBe(0);
    expect(game().turnDeadline).toBe(before);
  });

  it("when the player on turn surrenders (3 players) the next player gets a fresh clock", () => {
    game().start(3);
    vi.setSystemTime(Date.now() + 3_000);
    game().surrender(0);
    expect(game().state.turn).toBe(1);
    expect(game().turnDeadline).toBe(Date.now() + 10_000);
  });
});
