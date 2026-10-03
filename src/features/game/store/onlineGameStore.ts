import { create } from "zustand";
import {
  applyMove,
  createGame,
  surrender as engineSurrender,
  type Captured,
  type Cell,
  type GameState,
  type MoveResult,
  type PlayerCount,
} from "../engine";
import { frameOf, playEvents, type Floater } from "../animation";
import { gainedBy, type HistoryItem } from "../history";
import { sfx } from "../sound";
import type { PublicMove, RoomSnapshot } from "@/features/multiplayer/types";

interface OnlineGameStore {
  /** The state currently shown (lags the server while a move is animating). */
  shown: GameState | null;
  round: number;
  cells: Cell[];
  captured: Captured[];
  hand: { cell: number; count: number } | null;
  floaters: Floater[];
  animating: boolean;
  selected: number | null;
  history: HistoryItem[];
  soundOn: boolean;
  instant: boolean;

  select: (cell: number | null) => void;
  toggleSound: () => void;
  setInstant: (v: boolean) => void;
  /** Reconcile with a server snapshot: animate new moves, or jump to the server state. */
  sync: (snap: RoomSnapshot) => void;
  reset: () => void;
}

/** Re-run committed moves through the (deterministic) engine. */
function replay(base: GameState, m: PublicMove): MoveResult {
  return m.move.kind === "surrender"
    ? engineSurrender(base, m.seat)
    : applyMove(base, { seat: m.seat, cell: m.move.cell, direction: m.move.direction });
}

function historyItem(base: GameState, m: PublicMove, result: MoveResult): HistoryItem {
  return {
    n: m.version,
    seat: m.seat,
    kind: m.move.kind,
    cell: m.move.kind === "surrender" ? undefined : m.move.cell,
    direction: m.move.kind === "surrender" ? undefined : m.move.direction,
    gained: gainedBy(result.events, base.config),
  };
}

function buildHistory(playerCount: number, moves: PublicMove[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  let state = createGame(playerCount as PlayerCount);
  try {
    for (const m of moves) {
      const result = replay(state, m);
      items.push(historyItem(state, m, result));
      state = result.state;
    }
  } catch {
    /* keep what we could rebuild */
  }
  return items;
}

const MAX_ANIMATED_GAP = 3;
let generation = 0;
let chain: Promise<void> = Promise.resolve();

const empty = {
  shown: null,
  round: 0,
  cells: [] as Cell[],
  captured: [] as Captured[],
  hand: null,
  floaters: [] as Floater[],
  animating: false,
  selected: null,
  history: [] as HistoryItem[],
};

export const useOnlineGame = create<OnlineGameStore>((set, get) => {
  const jump = (snap: RoomSnapshot) => {
    generation++;
    const s = snap.session!;
    set({
      ...frameOf(s.state),
      shown: s.state,
      round: s.round,
      animating: false,
      selected: null,
      history: buildHistory(snap.room.playerLimit, snap.moves),
    });
  };

  const doSync = async (snap: RoomSnapshot) => {
    const session = snap.session;
    if (!session) return;
    const cur = get().shown;
    if (!cur || get().round !== session.round || session.version < cur.version) return jump(snap);
    if (session.version === cur.version) return;
    if (session.version - cur.version > MAX_ANIMATED_GAP) return jump(snap);

    const gen = ++generation;
    let state = cur;
    set({ animating: true, selected: null });
    for (let v = cur.version + 1; v <= session.version; v++) {
      const m = snap.moves.find((x) => x.version === v);
      let result: MoveResult;
      try {
        if (!m) throw new Error("missing move");
        result = replay(state, m);
      } catch {
        return jump(snap); // can't reproduce it locally: trust the server
      }
      const { soundOn, instant } = get();
      const done = await playEvents(state, result.events, {
        get: () => get(),
        set: (patch) => set(patch),
        soundOn,
        instant,
        cancelled: () => gen !== generation,
      });
      if (!done) return;
      set({
        ...frameOf(result.state),
        shown: result.state,
        history: [...get().history, historyItem(state, m!, result)],
      });
      state = result.state;
    }
    // the replay must land exactly on the authoritative state
    if (JSON.stringify(state.cells) !== JSON.stringify(session.state.cells) || state.turn !== session.state.turn)
      return jump(snap);
    set({ animating: false, shown: session.state, ...frameOf(session.state) });
    if (session.state.status === "finished" && get().soundOn) sfx.win();
  };

  return {
    ...empty,
    soundOn: true,
    instant: false,
    select: (cell) => {
      const { shown, animating } = get();
      if (animating || !shown || shown.status !== "playing") return;
      set({ selected: cell !== null && shown.cells[cell]?.dan > 0 ? cell : null });
    },
    toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
    setInstant: (instant) => set({ instant }),
    sync: (snap) => {
      chain = chain.then(() => doSync(snap)).catch(() => set({ animating: false }));
    },
    reset: () => {
      generation++;
      chain = Promise.resolve();
      set({ ...empty });
    },
  };
});
