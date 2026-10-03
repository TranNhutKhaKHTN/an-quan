export type PlayerCount = 2 | 3 | 4;
export type Direction = 1 | -1; // 1 = clockwise (cw), -1 = counter-clockwise (ccw)
export type Seat = number;

export interface RuleConfig {
  playerCount: PlayerCount;
  housesPerSide: number;
  danPerHouse: number;
  quanPerCorner: number;
  danValue: number;
  quanValue: number;
  /** Captured dân needed (and spent) to refill an empty side. */
  feedCount: number;
  /** A quan cell holding fewer dân than this cannot be captured (0 = always). */
  minDanToCaptureQuan: number;
  /** Safety cap on pieces sown within a single move. */
  maxSowSteps: number;
}

export interface Cell {
  dan: number;
  quan: number;
}

export interface CellLayout {
  index: number;
  kind: "house" | "quan";
  /** Seat that owns the house; null for quan cells. */
  owner: Seat | null;
}

export interface Captured {
  dan: number;
  quan: number;
}

export type GameStatus = "playing" | "finished";
export type EndReason = "quan-captured" | "last-player" | "surrender";

export interface GameState {
  config: RuleConfig;
  cells: Cell[];
  turn: Seat;
  captured: Captured[];
  eliminated: boolean[];
  surrendered: boolean[];
  status: GameStatus;
  endReason: EndReason | null;
  winners: Seat[];
  version: number;
  moveCount: number;
}

export interface Move {
  seat: Seat;
  cell: number;
  direction: Direction;
}

export type GameEvent =
  | { type: "pick"; cell: number; dan: number }
  | { type: "sow"; cell: number }
  | { type: "capture"; cell: number; dan: number; quan: number; seat: Seat }
  | { type: "feed"; seat: Seat; cells: number[] }
  | { type: "eliminate"; seat: Seat }
  | { type: "collect"; seat: Seat; dan: number }
  | { type: "turn"; seat: Seat }
  | { type: "end"; reason: EndReason; winners: Seat[] };

export type EngineErrorCode =
  | "GAME_FINISHED"
  | "NOT_YOUR_TURN"
  | "STALE_VERSION"
  | "INVALID_CELL"
  | "NOT_YOUR_HOUSE"
  | "EMPTY_HOUSE"
  | "INVALID_DIRECTION"
  | "INVALID_SEAT";

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "EngineError";
  }
}

export interface MoveResult {
  state: GameState;
  events: GameEvent[];
}
