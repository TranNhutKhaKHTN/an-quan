import { describe, expect, it } from "vitest";
import {
  EngineError,
  activeSeats,
  applyMove,
  buildLayout,
  createGame,
  defaultMove,
  houseIndices,
  legalMoves,
  quanIndices,
  score,
  scores,
  surrender,
  type Direction,
  type GameState,
  type PlayerCount,
} from "@/features/game/engine";

/**
 * 2-player ring: 0 = quan, 1-5 = seat 0, 6 = quan, 7-11 = seat 1.
 * `make` builds an empty board, then applies the given cells.
 */
type Spec = Record<number, { dan?: number; quan?: number }>;
function make(players: PlayerCount, spec: Spec, patch: Partial<GameState> = {}): GameState {
  const g = createGame(players);
  g.cells = g.cells.map(() => ({ dan: 0, quan: 0 }));
  for (const [i, c] of Object.entries(spec)) g.cells[+i] = { dan: c.dan ?? 0, quan: c.quan ?? 0 };
  return { ...g, ...patch };
}
const mv = (state: GameState, cell: number, direction: Direction = 1) =>
  applyMove(state, { seat: state.turn, cell, direction });
const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe(code);
    return;
  }
  throw new Error(`expected EngineError ${code}`);
};

describe("board initialization", () => {
  it.each([
    [2, 12],
    [3, 18],
    [4, 24],
  ] as const)("%i players -> %i cells with correct layout", (p, size) => {
    const g = createGame(p);
    expect(g.cells).toHaveLength(size);
    expect(quanIndices(g.config)).toHaveLength(p);
    for (let seat = 0; seat < p; seat++) {
      expect(houseIndices(g.config, seat)).toHaveLength(5);
      for (const i of houseIndices(g.config, seat)) expect(g.cells[i]).toEqual({ dan: 5, quan: 0 });
    }
    for (const i of quanIndices(g.config)) expect(g.cells[i]).toEqual({ dan: 0, quan: 1 });
    const layout = buildLayout(g.config);
    expect(layout.filter((l) => l.kind === "quan")).toHaveLength(p);
    expect(layout.filter((l) => l.owner === p - 1)).toHaveLength(5);
    expect(g.turn).toBe(0);
    expect(g.status).toBe("playing");
    expect(scores(g)).toEqual(Array(p).fill(0));
  });

  it("2-player matches the classic layout", () => {
    const g = createGame(2);
    expect(quanIndices(g.config)).toEqual([0, 6]);
    expect(houseIndices(g.config, 0)).toEqual([1, 2, 3, 4, 5]);
    expect(houseIndices(g.config, 1)).toEqual([7, 8, 9, 10, 11]);
  });

  it("accepts config overrides", () => {
    const g = createGame(3, { danPerHouse: 3, quanValue: 7 });
    expect(g.cells[1].dan).toBe(3);
    expect(g.config.quanValue).toBe(7);
  });
});

describe("legal moves and validation", () => {
  it("lists only own non-empty houses in both directions", () => {
    const g = createGame(2);
    const moves = legalMoves(g);
    expect(moves).toHaveLength(10);
    expect(moves.every((m) => m.seat === 0 && m.cell >= 1 && m.cell <= 5)).toBe(true);
    expect(legalMoves(g, 1)).toEqual([]);
  });

  it("rejects invalid moves with specific codes", () => {
    const g = make(2, { 1: { dan: 2 }, 3: { dan: 0 }, 6: { quan: 1 }, 9: { dan: 1 } });
    expectCode(() => applyMove(g, { seat: 1, cell: 9, direction: 1 }), "NOT_YOUR_TURN");
    expectCode(() => applyMove(g, { seat: 0, cell: 9, direction: 1 }), "NOT_YOUR_HOUSE");
    expectCode(() => applyMove(g, { seat: 0, cell: 0, direction: 1 }), "NOT_YOUR_HOUSE");
    expectCode(() => applyMove(g, { seat: 0, cell: 3, direction: 1 }), "EMPTY_HOUSE");
    expectCode(() => applyMove(g, { seat: 0, cell: 99, direction: 1 }), "INVALID_CELL");
    expectCode(() => applyMove(g, { seat: 0, cell: 1.5, direction: 1 }), "INVALID_CELL");
    expectCode(() => applyMove(g, { seat: 0, cell: 1, direction: 2 as Direction }), "INVALID_DIRECTION");
    expectCode(() => applyMove(g, { seat: 7, cell: 1, direction: 1 }), "INVALID_SEAT");
  });

  it("rejects moves after the game finished", () => {
    const g = make(2, { 1: { dan: 3 }, 6: { quan: 1 }, 9: { dan: 1 } });
    const { state } = mv(g, 1);
    expect(state.status).toBe("finished");
    expectCode(() => applyMove(state, { seat: 1, cell: 9, direction: 1 }), "GAME_FINISHED");
    expect(legalMoves(state)).toEqual([]);
  });
});

describe("sowing", () => {
  it("sows one piece per cell and hands the turn over", () => {
    const g = make(2, { 0: { quan: 1 }, 1: { dan: 3 }, 6: { quan: 1 }, 9: { dan: 2 } });
    // 1 -> sows 2,3,4 ; next (5) empty, 6 is a quan => captured
    const { state, events } = mv(g, 1);
    expect(state.cells[1].dan).toBe(0);
    expect([2, 3, 4].map((i) => state.cells[i].dan)).toEqual([1, 1, 1]);
    expect(events.filter((e) => e.type === "sow").map((e) => (e as { cell: number }).cell)).toEqual([2, 3, 4]);
    expect(state.turn).toBe(1);
    expect(state.version).toBe(1);
  });

  it("continues sowing from a non-empty next house", () => {
    const g = make(2, { 0: { quan: 1 }, 1: { dan: 1 }, 2: { dan: 2 }, 3: { dan: 1 }, 6: { quan: 1 }, 9: { dan: 1 } });
    const { state, events } = mv(g, 1);
    expect(events.filter((e) => e.type === "pick").map((e) => (e as { cell: number }).cell)).toEqual([1, 3]);
    expect(state.cells[2].dan).toBe(3);
    expect(state.cells[3].dan).toBe(0);
    expect(state.cells[4].dan).toBe(1);
    expect(state.captured[0]).toEqual({ dan: 0, quan: 1 }); // then 5 empty, 6 quan captured
  });

  it("ends the turn when the next cell is a non-empty quan cell", () => {
    const g = make(2, { 0: { quan: 1 }, 4: { dan: 1 }, 6: { quan: 1 }, 9: { dan: 1 } });
    const { state } = mv(g, 4);
    expect(state.cells[5].dan).toBe(1);
    expect(state.captured[0]).toEqual({ dan: 0, quan: 0 });
    expect(state.cells[6]).toEqual({ dan: 0, quan: 1 });
    expect(state.turn).toBe(1);
  });

  it("sows counter-clockwise and wraps around the ring", () => {
    const g = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 1: { dan: 2 }, 10: { dan: 3 }, 9: { dan: 1 } });
    const ccw = mv(g, 1, -1); // sows 0, 11 ; next 10 non-empty -> continue
    expect(ccw.state.cells[0]).toEqual({ dan: 1, quan: 1 });
    expect(ccw.state.cells[11].dan).toBe(1);

    const wrap = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 5: { dan: 1 }, 7: { dan: 1 } }, { turn: 1 });
    const r = applyMove(wrap, { seat: 1, cell: 7, direction: -1 });
    expect(r.state.cells[6].dan).toBe(1);
  });
});

describe("captures", () => {
  it("captures after an empty house", () => {
    const g = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 1: { dan: 1 }, 3: { dan: 4 }, 9: { dan: 1 } });
    // sow 2 -> next 3 non-empty: continue (picks 4), so use a gap instead
    const g2 = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 1: { dan: 1 }, 4: { dan: 4 }, 9: { dan: 1 } });
    const { state, events } = mv(g2, 1);
    expect(state.captured[0].dan).toBe(4);
    expect(state.cells[4].dan).toBe(0);
    expect(events.find((e) => e.type === "capture")).toMatchObject({ cell: 4, dan: 4, seat: 0 });
    expect(g.cells[3].dan).toBe(4); // input untouched
  });

  it("chains captures across consecutive empty/non-empty pairs, including quan", () => {
    const g = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 1: { dan: 1 }, 4: { dan: 2 }, 9: { dan: 1 } });
    // sow 2, 3 empty, 4 (2 dan) captured, 5 empty, 6 quan captured, 7 empty, 8 empty stop
    const { state } = mv(g, 1);
    expect(state.captured[0]).toEqual({ dan: 2, quan: 1 });
    expect(score(state, 0)).toBe(12);
    expect(state.cells[6]).toEqual({ dan: 0, quan: 0 });
  });

  it("captures from the opponent's side", () => {
    const g = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 5: { dan: 2 }, 8: { dan: 3 }, 11: { dan: 1 } });
    // 5 -> sows 6,7 ; 8 non-empty so it continues: picks 8 (4) sows 9,10,11,0 ; next 1 empty, 2 empty
    const { state } = mv(g, 5);
    expect(state.turn).toBe(1);
    const h = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 5: { dan: 1 }, 8: { dan: 5 }, 11: { dan: 1 } });
    // sow 6 (quan cell), next 7 empty, 8 has 5 -> capture
    const r = mv(h, 5);
    expect(r.state.captured[0].dan).toBe(5);
  });

  it("does not capture when two empty cells follow", () => {
    const g = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 1: { dan: 1 }, 9: { dan: 3 } });
    const { state } = mv(g, 1);
    expect(state.captured[0]).toEqual({ dan: 0, quan: 0 });
  });

  it("respects minDanToCaptureQuan", () => {
    const spec = { 0: { quan: 1 }, 3: { dan: 1 }, 6: { quan: 1, dan: 2 }, 9: { dan: 1 } };
    const blocked = make(2, spec, { config: { ...createGame(2).config, minDanToCaptureQuan: 5 } });
    expect(mv(blocked, 3).state.captured[0]).toEqual({ dan: 0, quan: 0 });
    const open = make(2, spec);
    expect(mv(open, 3).state.captured[0]).toEqual({ dan: 2, quan: 1 });
  });
});

describe("feeding and elimination", () => {
  it("feeds an empty player from their captured dân", () => {
    const g = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 1: { dan: 1 } });
    g.captured[1] = { dan: 6, quan: 0 };
    const { state, events } = mv(g, 1);
    expect(state.turn).toBe(1);
    expect(houseIndices(state.config, 1).map((i) => state.cells[i].dan)).toEqual([1, 1, 1, 1, 1]);
    expect(state.captured[1].dan).toBe(1);
    expect(events.some((e) => e.type === "feed" && e.seat === 1)).toBe(true);
  });

  it("2 players: eliminating the opponent ends the game and collects own-side dân", () => {
    const g = make(2, { 0: { quan: 1 }, 6: { quan: 1 }, 1: { dan: 1 }, 5: { dan: 4 } });
    g.captured[1] = { dan: 2, quan: 0 };
    const { state } = mv(g, 1);
    expect(state.eliminated).toEqual([false, true]);
    expect(state.status).toBe("finished");
    expect(state.endReason).toBe("last-player");
    expect(state.winners).toEqual([0]);
    expect(state.captured[0].dan).toBe(5); // 1 sown piece + 4 collected from own side
  });

  it("3 players: skips an eliminated seat in turn order", () => {
    // seat 1 owns 7-11? no: ring is [Q,1-5 | Q,7-11 | Q,13-17]
    const g = make(3, { 0: { quan: 1 }, 6: { quan: 1 }, 12: { quan: 1 }, 1: { dan: 1 }, 5: { dan: 3 }, 14: { dan: 2 }, 17: { dan: 1 } });
    g.captured[1] = { dan: 1, quan: 0 };
    const a = mv(g, 1);
    expect(a.state.eliminated).toEqual([false, true, false]);
    expect(a.state.status).toBe("playing");
    expect(a.state.turn).toBe(2);
    expect(activeSeats(a.state)).toEqual([0, 2]);
    const b = mv(a.state, 14);
    expect(b.state.turn).toBe(0); // skipped seat 1
  });
});

describe("end of game and scoring", () => {
  const endSpec = { 1: { dan: 3 }, 6: { quan: 1 }, 9: { dan: 11 } };

  it("ends when all quan are captured and each side collects its dân", () => {
    const { state, events } = mv(make(2, endSpec), 1);
    expect(state.status).toBe("finished");
    expect(state.endReason).toBe("quan-captured");
    expect(state.captured[0]).toEqual({ dan: 3, quan: 1 }); // 3 sown pieces collected
    expect(state.captured[1]).toEqual({ dan: 11, quan: 0 });
    expect(scores(state)).toEqual([13, 11]);
    expect(state.winners).toEqual([0]);
    expect(events.at(-1)).toMatchObject({ type: "end", winners: [0] });
    expect(state.cells.every((c) => c.dan === 0 && c.quan === 0)).toBe(true);
  });

  it("reports a draw when top scores tie", () => {
    const { state } = mv(make(2, { ...endSpec, 9: { dan: 13 } }), 1);
    expect(scores(state)).toEqual([13, 13]);
    expect(state.winners).toEqual([0, 1]);
  });

  it("uses configurable piece values", () => {
    const g = make(2, endSpec);
    g.config = { ...g.config, quanValue: 3, danValue: 2 };
    const { state } = mv(g, 1);
    expect(scores(state)).toEqual([3 + 3 * 2, 11 * 2]);
  });

  it("works for 4 players: dân in a quan-less corner go to the last mover", () => {
    const g = make(4, { 6: { quan: 1 }, 1: { dan: 3 }, 12: { dan: 2 } });
    const { state } = mv(g, 1);
    expect(state.status).toBe("finished");
    expect(state.winners).toEqual([0]);
    expect(state.captured[0]).toEqual({ dan: 5, quan: 1 }); // 3 own + 2 from the quan-less corner
  });
});

describe("surrender", () => {
  it("2 players: the other player wins", () => {
    const { state } = surrender(createGame(2), 0);
    expect(state.status).toBe("finished");
    expect(state.endReason).toBe("surrender");
    expect(state.winners).toEqual([1]);
  });

  it("3 players: game continues; turn passes if the surrenderer was on turn", () => {
    const { state } = surrender(createGame(3), 0);
    expect(state.status).toBe("playing");
    expect(state.turn).toBe(1);
    expect(legalMoves(state, 0)).toEqual([]);
    const later = surrender(state, 2).state;
    expect(later.status).toBe("finished");
    expect(later.winners).toEqual([1]);
  });

  it("a surrenderer off-turn does not change the turn", () => {
    const { state } = surrender(createGame(4), 2);
    expect(state.turn).toBe(0);
    expect(state.eliminated).toEqual([false, false, true, false]);
  });

  it("rejects stale and repeated surrenders", () => {
    const g = createGame(3);
    expectCode(() => surrender(g, 0, 9), "STALE_VERSION");
    const s = surrender(g, 1).state;
    expectCode(() => surrender(s, 1), "INVALID_SEAT");
  });
});

describe("determinism, immutability and concurrency", () => {
  it("never mutates the input state and is deterministic", () => {
    const g = createGame(3);
    const snapshot = JSON.stringify(g);
    const a = mv(g, 1);
    const b = mv(g, 1);
    expect(JSON.stringify(g)).toBe(snapshot);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("state is JSON round-trippable", () => {
    const g = mv(createGame(4), 2, -1).state;
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  it("of two simultaneous moves on the same version only the first applies", () => {
    const g = createGame(2);
    const first = applyMove(g, { seat: 0, cell: 1, direction: 1 }, g.version);
    expect(first.state.version).toBe(1);
    expectCode(() => applyMove(first.state, { seat: 0, cell: 2, direction: 1 }, g.version), "STALE_VERSION");
    // and a duplicate submission of the same move is also rejected (turn moved on)
    expectCode(() => applyMove(first.state, { seat: 0, cell: 1, direction: 1 }), "NOT_YOUR_TURN");
  });

  it("stops runaway sowing at maxSowSteps", () => {
    const g = createGame(2, { maxSowSteps: 3 });
    const { events } = mv(g, 1);
    expect(events.filter((e) => e.type === "sow")).toHaveLength(3);
  });
});

/* Seeded random playouts check conservation and termination across all modes. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe("random playouts (invariants)", () => {
  it.each([2, 3, 4] as const)("%i players: pieces conserved and games terminate", (players) => {
    for (let seed = 1; seed <= 25; seed++) {
      const rand = rng(seed * 7919 + players);
      let g = createGame(players);
      const totalDan = g.cells.reduce((s, c) => s + c.dan, 0);
      const totalQuan = g.cells.reduce((s, c) => s + c.quan, 0);
      let moves = 0;
      while (g.status === "playing" && moves < 5000) {
        const options = legalMoves(g);
        expect(options.length).toBeGreaterThan(0);
        g = applyMove(g, options[Math.floor(rand() * options.length)], g.version).state;
        moves++;
        const dan = g.cells.reduce((s, c) => s + c.dan, 0) + g.captured.reduce((s, c) => s + c.dan, 0);
        const quan = g.cells.reduce((s, c) => s + c.quan, 0) + g.captured.reduce((s, c) => s + c.quan, 0);
        expect(dan).toBe(totalDan);
        expect(quan).toBe(totalQuan);
      }
      expect(g.status).toBe("finished");
      expect(g.winners.length).toBeGreaterThan(0);
    }
  });

  it("defaultMove returns a legal move", () => {
    const g = createGame(3);
    expect(legalMoves(g)).toContainEqual(defaultMove(g));
  });
});
