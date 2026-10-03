import type { Captured, Cell, GameEvent, GameState } from "./engine";
import { sfx } from "./sound";

export interface Floater {
  id: number;
  cell: number;
  text: string;
}

/** What the board draws while a move is being played back. */
export interface Frame {
  cells: Cell[];
  captured: Captured[];
  hand: { cell: number; count: number } | null;
  floaters: Floater[];
}

export interface PlaybackIO {
  get: () => Frame;
  set: (patch: Partial<Frame>) => void;
  soundOn: boolean;
  /** Skip the delays (reduced motion). */
  instant: boolean;
  /** Return true to abort (e.g. the game was restarted). */
  cancelled: () => boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let floaterId = 0;

export const frameOf = (state: GameState): Frame => ({
  cells: state.cells,
  captured: state.captured,
  hand: null,
  floaters: [],
});

/**
 * Plays the engine's event list step by step on top of `base`
 * (the state before the move). Resolves to false if cancelled.
 */
export async function playEvents(base: GameState, events: GameEvent[], io: PlaybackIO): Promise<boolean> {
  const { config } = base;
  const cells = base.cells.map((c) => ({ ...c }));
  const captured = base.captured.map((c) => ({ ...c }));
  const snap = (c: Cell[]) => c.map((x) => ({ ...x }));
  const sound = (f: () => void) => io.soundOn && f();
  const pause = (ms: number) => (io.instant ? Promise.resolve() : wait(ms));

  for (const e of events) {
    if (io.cancelled()) return false;
    if (e.type === "pick") {
      cells[e.cell].dan = 0;
      io.set({ cells: snap(cells), hand: { cell: e.cell, count: e.dan } });
      sound(sfx.pick);
      await pause(320);
    } else if (e.type === "sow") {
      cells[e.cell].dan++;
      const h = io.get().hand;
      io.set({ cells: snap(cells), hand: h ? { cell: e.cell, count: h.count - 1 } : null });
      sound(sfx.sow);
      await pause(170);
    } else if (e.type === "capture") {
      cells[e.cell] = { dan: 0, quan: 0 };
      captured[e.seat].dan += e.dan;
      captured[e.seat].quan += e.quan;
      const id = ++floaterId;
      const points = e.dan * config.danValue + e.quan * config.quanValue;
      io.set({
        cells: snap(cells),
        captured: captured.map((c) => ({ ...c })),
        hand: null,
        floaters: [...io.get().floaters, { id, cell: e.cell, text: `+${points}` }],
      });
      sound(sfx.capture);
      setTimeout(() => io.set({ floaters: io.get().floaters.filter((f) => f.id !== id) }), 1100);
      await pause(750);
    }
  }
  return !io.cancelled();
}
