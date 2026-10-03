import {
  applyMove,
  houseIndices,
  legalMoves,
  scores,
  type GameState,
  type Move,
  type PlayerCount,
  type Seat,
} from "./engine";

export type BotLevel = "easy" | "medium" | "hard";

export const BOT_LEVELS: { level: BotLevel; label: string }[] = [
  { level: "easy", label: "Dễ" },
  { level: "medium", label: "Vừa" },
  { level: "hard", label: "Khó" },
];

/** Plies searched by the hard bot (kept small enough to answer in well under a second). */
const HARD_DEPTH: Record<PlayerCount, number> = { 2: 4, 3: 3, 4: 3 };
/** Value of dân still sitting on a side: they are collected by its owner when the game ends. */
const BOARD_WEIGHT = 0.4;

const danOnSide = (state: GameState, seat: Seat) =>
  houseIndices(state.config, seat).reduce((sum, i) => sum + state.cells[i].dan, 0) * state.config.danValue;

/** My standing minus the strongest rival's, from `me`'s point of view. */
function evaluate(state: GameState, me: Seat): number {
  if (state.eliminated[me]) return -1000;
  const sc = scores(state);
  const finished = state.status === "finished";
  const total = (seat: Seat) => sc[seat] + (finished ? 0 : BOARD_WEIGHT * danOnSide(state, seat));
  let rival = -Infinity;
  for (let seat = 0; seat < sc.length; seat++) {
    if (seat !== me && !state.eliminated[seat]) rival = Math.max(rival, total(seat));
  }
  return total(me) - (rival === -Infinity ? 0 : rival);
}

/**
 * Paranoid alpha-beta: `me` maximises, every other seat is assumed to minimise `me`'s lead.
 * Exact for 2 players, a cautious approximation for 3-4.
 */
function search(state: GameState, me: Seat, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || state.status === "finished") return evaluate(state, me);
  const moves = legalMoves(state);
  if (moves.length === 0) return evaluate(state, me);
  if (state.turn === me) {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, search(applyMove(state, m).state, me, depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, search(applyMove(state, m).state, me, depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Picks a move for the seat on turn.
 *  - easy:   random legal move.
 *  - medium: best immediate result (one ply, so it takes captures and avoids giving them away
 *            only by luck).
 *  - hard:   alpha-beta lookahead.
 * Ties are broken with `rng`, so a seeded rng makes the choice reproducible.
 */
export function chooseMove(state: GameState, level: BotLevel, rng: () => number = Math.random): Move {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error("chooseMove: no legal moves");
  if (level === "easy") return moves[Math.floor(rng() * moves.length)];

  const me = state.turn;
  const depth = level === "medium" ? 1 : HARD_DEPTH[state.config.playerCount];
  let bestValue = -Infinity;
  let best: Move[] = [];
  for (const m of moves) {
    const value = search(applyMove(state, m).state, me, depth - 1, -Infinity, Infinity);
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = [m];
    } else if (Math.abs(value - bestValue) <= 1e-9) best.push(m);
  }
  return best[Math.floor(rng() * best.length)];
}
