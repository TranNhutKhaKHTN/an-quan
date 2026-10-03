import type { Direction, GameEvent, RuleConfig, Seat } from "./engine";

export interface HistoryItem {
  n: number;
  seat: Seat;
  /** Undefined for a surrender. */
  cell?: number;
  direction?: Direction;
  kind?: "move" | "timeout" | "surrender";
  gained: number;
}

/** Points the mover earned from captures in one move. */
export function gainedBy(events: GameEvent[], config: RuleConfig): number {
  return events.reduce(
    (sum, e) => (e.type === "capture" ? sum + e.dan * config.danValue + e.quan * config.quanValue : sum),
    0,
  );
}
