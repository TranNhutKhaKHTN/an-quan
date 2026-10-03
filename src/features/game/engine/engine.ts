import {
  EngineError,
  type CellLayout,
  type Direction,
  type GameEvent,
  type GameState,
  type Move,
  type MoveResult,
  type PlayerCount,
  type RuleConfig,
  type Seat,
} from "./types";
import { defaultConfig } from "./modes";

/* ------------------------------------------------------------------ layout */

export function ringSize(config: RuleConfig): number {
  return config.playerCount * (config.housesPerSide + 1);
}

export function buildLayout(config: RuleConfig): CellLayout[] {
  const stride = config.housesPerSide + 1;
  return Array.from({ length: ringSize(config) }, (_, index) => {
    const offset = index % stride;
    return offset === 0
      ? { index, kind: "quan" as const, owner: null }
      : { index, kind: "house" as const, owner: Math.floor(index / stride) };
  });
}

export function houseIndices(config: RuleConfig, seat: Seat): number[] {
  const stride = config.housesPerSide + 1;
  return Array.from({ length: config.housesPerSide }, (_, i) => seat * stride + 1 + i);
}

export function quanIndices(config: RuleConfig): number[] {
  const stride = config.housesPerSide + 1;
  return Array.from({ length: config.playerCount }, (_, i) => i * stride);
}

const isQuanCell = (config: RuleConfig, index: number) =>
  index % (config.housesPerSide + 1) === 0;

const ownerOf = (config: RuleConfig, index: number): Seat | null =>
  isQuanCell(config, index) ? null : Math.floor(index / (config.housesPerSide + 1));

/* ---------------------------------------------------------------- creation */

export function createGame(
  playerCount: PlayerCount,
  overrides: Partial<Omit<RuleConfig, "playerCount">> = {},
): GameState {
  const config: RuleConfig = { ...defaultConfig(playerCount), ...overrides, playerCount };
  const cells = buildLayout(config).map((l) =>
    l.kind === "quan"
      ? { dan: 0, quan: config.quanPerCorner }
      : { dan: config.danPerHouse, quan: 0 },
  );
  return {
    config,
    cells,
    turn: 0,
    captured: Array.from({ length: playerCount }, () => ({ dan: 0, quan: 0 })),
    eliminated: Array(playerCount).fill(false),
    surrendered: Array(playerCount).fill(false),
    status: "playing",
    endReason: null,
    winners: [],
    version: 0,
    moveCount: 0,
  };
}

const clone = (s: GameState): GameState => ({
  ...s,
  cells: s.cells.map((c) => ({ ...c })),
  captured: s.captured.map((c) => ({ ...c })),
  eliminated: [...s.eliminated],
  surrendered: [...s.surrendered],
  winners: [...s.winners],
});

/* ----------------------------------------------------------------- queries */

export function score(state: GameState, seat: Seat): number {
  const { danValue, quanValue } = state.config;
  const c = state.captured[seat];
  return c.dan * danValue + c.quan * quanValue;
}

export function scores(state: GameState): number[] {
  return state.captured.map((_, seat) => score(state, seat));
}

export function activeSeats(state: GameState): Seat[] {
  return state.eliminated.flatMap((out, seat) => (out ? [] : [seat]));
}

export function legalMoves(state: GameState, seat: Seat = state.turn): Move[] {
  if (state.status !== "playing" || seat !== state.turn || state.eliminated[seat]) return [];
  return houseIndices(state.config, seat)
    .filter((i) => state.cells[i].dan > 0)
    .flatMap((cell) => ([1, -1] as Direction[]).map((direction) => ({ seat, cell, direction })));
}

/** Deterministic fallback move (used for timeouts): first legal move. */
export function defaultMove(state: GameState): Move | null {
  return legalMoves(state)[0] ?? null;
}

/* -------------------------------------------------------------- validation */

function validate(state: GameState, move: Move, expectedVersion?: number) {
  if (expectedVersion !== undefined && expectedVersion !== state.version)
    throw new EngineError("STALE_VERSION", `expected v${expectedVersion}, state is v${state.version}`);
  if (state.status !== "playing") throw new EngineError("GAME_FINISHED");
  if (!Number.isInteger(move.seat) || move.seat < 0 || move.seat >= state.config.playerCount)
    throw new EngineError("INVALID_SEAT");
  if (move.seat !== state.turn) throw new EngineError("NOT_YOUR_TURN");
  if (move.direction !== 1 && move.direction !== -1) throw new EngineError("INVALID_DIRECTION");
  if (!Number.isInteger(move.cell) || move.cell < 0 || move.cell >= state.cells.length)
    throw new EngineError("INVALID_CELL");
  if (ownerOf(state.config, move.cell) !== move.seat) throw new EngineError("NOT_YOUR_HOUSE");
  if (state.cells[move.cell].dan === 0) throw new EngineError("EMPTY_HOUSE");
}

/* ------------------------------------------------------------------- moves */

export function applyMove(state: GameState, move: Move, expectedVersion?: number): MoveResult {
  validate(state, move, expectedVersion);
  const s = clone(state);
  const { config, cells } = s;
  const n = cells.length;
  const events: GameEvent[] = [];
  const next = (i: number) => (((i + move.direction) % n) + n) % n;
  const total = (i: number) => cells[i].dan + cells[i].quan;
  const capturable = (i: number) =>
    total(i) > 0 && (cells[i].quan === 0 || cells[i].dan >= config.minDanToCaptureQuan);

  let pos = move.cell;
  let hand = cells[pos].dan;
  cells[pos].dan = 0;
  events.push({ type: "pick", cell: pos, dan: hand });
  let sown = 0;

  sowing: for (;;) {
    while (hand > 0) {
      if (sown++ >= config.maxSowSteps) break sowing;
      pos = next(pos);
      cells[pos].dan++;
      hand--;
      events.push({ type: "sow", cell: pos });
    }
    const n1 = next(pos);
    if (!isQuanCell(config, n1) && cells[n1].dan > 0) {
      pos = n1;
      hand = cells[n1].dan;
      cells[n1].dan = 0;
      events.push({ type: "pick", cell: n1, dan: hand });
      continue;
    }
    if (total(n1) > 0) break; // non-empty quan cell ends the turn
    // n1 empty: chain captures
    let cur = pos;
    for (;;) {
      const empty = next(cur);
      const target = next(empty);
      if (total(empty) > 0 || !capturable(target)) break;
      const { dan, quan } = cells[target];
      cells[target] = { dan: 0, quan: 0 };
      s.captured[move.seat].dan += dan;
      s.captured[move.seat].quan += quan;
      events.push({ type: "capture", cell: target, dan, quan, seat: move.seat });
      cur = target;
    }
    break;
  }

  s.version++;
  s.moveCount++;
  settle(s, move.seat, events);
  return { state: s, events };
}

/* ------------------------------------------------- turn flow and game end */

function finish(
  s: GameState,
  reason: NonNullable<GameState["endReason"]>,
  lastMover: Seat,
  events: GameEvent[],
) {
  const { config } = s;
  for (let seat = 0; seat < config.playerCount; seat++) {
    let dan = 0;
    for (const i of houseIndices(config, seat)) {
      dan += s.cells[i].dan;
      s.cells[i].dan = 0;
    }
    if (dan > 0) {
      s.captured[seat].dan += dan;
      events.push({ type: "collect", seat, dan });
    }
  }
  for (const i of quanIndices(config)) {
    const dan = s.cells[i].dan;
    if (dan > 0) {
      s.cells[i].dan = 0;
      s.captured[lastMover].dan += dan;
      events.push({ type: "collect", seat: lastMover, dan });
    }
  }
  const contenders = activeSeats(s);
  const pool = contenders.length ? contenders : s.captured.map((_, i) => i);
  const best = Math.max(...pool.map((seat) => score(s, seat)));
  s.winners = pool.filter((seat) => score(s, seat) === best);
  s.status = "finished";
  s.endReason = reason;
  events.push({ type: "end", reason, winners: s.winners });
}

const quanLeft = (s: GameState) => s.cells.reduce((sum, c) => sum + c.quan, 0);

function settle(s: GameState, mover: Seat, events: GameEvent[]) {
  const { config } = s;
  if (quanLeft(s) === 0) return finish(s, "quan-captured", mover, events);
  if (activeSeats(s).length <= 1) return finish(s, "last-player", mover, events);

  let seat = mover;
  for (let i = 0; i < config.playerCount; i++) {
    seat = (seat + 1) % config.playerCount;
    if (s.eliminated[seat]) continue;
    const houses = houseIndices(config, seat);
    if (houses.some((h) => s.cells[h].dan > 0)) break;
    if (s.captured[seat].dan >= config.feedCount) {
      s.captured[seat].dan -= config.feedCount;
      for (let k = 0; k < config.feedCount; k++) s.cells[houses[k % houses.length]].dan++;
      events.push({ type: "feed", seat, cells: houses });
      break;
    }
    s.eliminated[seat] = true;
    events.push({ type: "eliminate", seat });
    if (activeSeats(s).length <= 1) return finish(s, "last-player", mover, events);
  }
  s.turn = seat;
  events.push({ type: "turn", seat });
}

/** A player gives up: they are eliminated and cannot win. */
export function surrender(state: GameState, seat: Seat, expectedVersion?: number): MoveResult {
  if (expectedVersion !== undefined && expectedVersion !== state.version)
    throw new EngineError("STALE_VERSION");
  if (state.status !== "playing") throw new EngineError("GAME_FINISHED");
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.config.playerCount || state.eliminated[seat])
    throw new EngineError("INVALID_SEAT");
  const s = clone(state);
  const events: GameEvent[] = [];
  s.eliminated[seat] = true;
  s.surrendered[seat] = true;
  s.version++;
  events.push({ type: "eliminate", seat });
  if (activeSeats(s).length <= 1) {
    finish(s, "surrender", seat, events);
  } else if (s.turn === seat) {
    settle(s, seat, events);
  }
  return { state: s, events };
}
