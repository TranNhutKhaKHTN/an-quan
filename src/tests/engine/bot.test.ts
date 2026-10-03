import { describe, expect, it } from "vitest";
import { applyMove, createGame, legalMoves, scores, type GameState, type PlayerCount } from "@/features/game/engine";
import { chooseMove, type BotLevel } from "@/features/game/bot";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function board(spec: Record<number, { dan?: number; quan?: number }>): GameState {
  const g = createGame(2);
  g.cells = g.cells.map(() => ({ dan: 0, quan: 0 }));
  for (const [i, c] of Object.entries(spec)) g.cells[+i] = { dan: c.dan ?? 0, quan: c.quan ?? 0 };
  return g;
}

describe("bot", () => {
  it.each(["easy", "medium", "hard"] as BotLevel[])("%s: always returns a legal move, for every mode", (level) => {
    for (const players of [2, 3, 4] as PlayerCount[]) {
      let g = createGame(players);
      const r = rng(players);
      for (let i = 0; i < 25 && g.status === "playing"; i++) {
        const m = chooseMove(g, level, r);
        expect(legalMoves(g)).toContainEqual(m);
        g = applyMove(g, m).state;
      }
    }
  });

  it("is reproducible with a seeded rng and never mutates the state", () => {
    const g = createGame(3);
    const snapshot = JSON.stringify(g);
    expect(chooseMove(g, "hard", rng(5))).toEqual(chooseMove(g, "hard", rng(5)));
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it("medium and hard take an available quan capture", () => {
    // Playing house 3 clockwise lands on 4, 5 is empty and the quan at 6 is captured (10 points).
    // House 1 only shuffles dân along 2 and 3.
    const g = board({ 0: { quan: 1 }, 6: { quan: 1 }, 1: { dan: 1 }, 2: { dan: 1 }, 3: { dan: 1 }, 9: { dan: 1 } });
    for (const level of ["medium", "hard"] as BotLevel[]) {
      const m = chooseMove(g, level, rng(1));
      const after = applyMove(g, m).state;
      expect(after.captured[0].quan, level).toBe(1);
    }
  });

  it("hard avoids a move that hands the opponent a quan", () => {
    const g = board({ 0: { quan: 1 }, 6: { quan: 1 }, 5: { dan: 2 }, 1: { dan: 1 }, 7: { dan: 0 }, 9: { dan: 3 } });
    const m = chooseMove(g, "hard", rng(2));
    const after = applyMove(g, m).state;
    expect(after.captured[1].quan).toBe(0);
  });

  it("hard answers quickly in every mode", () => {
    for (const players of [2, 3, 4] as PlayerCount[]) {
      const g = createGame(players);
      const t = performance.now();
      chooseMove(g, "hard", rng(3));
      expect(performance.now() - t).toBeLessThan(1500);
    }
  });

  /** Strength ordering, measured over seeded 2-player games with sides alternated. */
  function winRate(a: BotLevel, b: BotLevel, games: number) {
    let wins = 0;
    let decided = 0;
    for (let k = 0; k < games; k++) {
      const r = rng(100 + k);
      const aSeat = k % 2;
      let g = createGame(2);
      for (let i = 0; i < 400 && g.status === "playing"; i++) {
        g = applyMove(g, chooseMove(g, g.turn === aSeat ? a : b, r)).state;
      }
      if (g.status !== "finished") continue;
      const s = scores(g);
      if (s[0] === s[1]) continue;
      decided++;
      if (s[aSeat] > s[1 - aSeat]) wins++;
    }
    return { wins, decided };
  }

  it("medium beats easy, and hard beats medium, clearly more often than not", () => {
    const m = winRate("medium", "easy", 30);
    const h = winRate("hard", "medium", 20);
    console.log("medium vs easy", m, "hard vs medium", h);
    expect(m.wins / m.decided).toBeGreaterThan(0.6);
    expect(h.wins / h.decided).toBeGreaterThan(0.55);
  });
});
