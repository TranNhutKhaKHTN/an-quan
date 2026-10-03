import { create } from "zustand";
import {
  applyMove,
  createGame,
  surrender as engineSurrender,
  type Captured,
  type Cell,
  type Direction,
  type GameState,
  type Move,
  type PlayerCount,
  type Seat,
} from "../engine";
import { playEvents, type Floater } from "../animation";
import { gainedBy, type HistoryItem } from "../history";
import { sfx } from "../sound";

interface LocalGameStore {
  state: GameState;
  /** What is drawn on screen while a move is being animated. */
  cells: Cell[];
  captured: Captured[];
  hand: { cell: number; count: number } | null;
  floaters: Floater[];
  selected: number | null;
  animating: boolean;
  history: HistoryItem[];
  /** Increments on every new game; lets the UI reset per-game state. */
  gameId: number;
  soundOn: boolean;
  /** Set to true to skip step delays (reduced motion). */
  instant: boolean;

  start: (players: PlayerCount) => void;
  select: (cell: number | null) => void;
  play: (direction: Direction) => Promise<void>;
  /** Plays a complete move (used by bots): selects the house, then sows. */
  playMove: (move: Move) => Promise<void>;
  surrender: (seat: Seat) => void;
  toggleSound: () => void;
  setInstant: (v: boolean) => void;
}

let runId = 0;

function fresh(players: PlayerCount) {
  const state = createGame(players);
  return {
    state,
    cells: state.cells,
    captured: state.captured,
    hand: null,
    floaters: [] as Floater[],
    selected: null,
    animating: false,
    history: [] as HistoryItem[],
  };
}

export const useLocalGame = create<LocalGameStore>((set, get) => ({
  ...fresh(2),
  gameId: 0,
  soundOn: true,
  instant: false,

  start: (players) => {
    runId++;
    set({ ...fresh(players), gameId: get().gameId + 1 });
  },

  select: (cell) => {
    const { state, animating } = get();
    if (animating || state.status !== "playing") return;
    set({ selected: cell !== null && state.cells[cell]?.dan > 0 ? cell : null });
  },

  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
  setInstant: (instant) => set({ instant }),

  surrender: (seat) => {
    const { state, animating } = get();
    if (animating || state.status !== "playing") return;
    const result = engineSurrender(state, seat);
    set({
      state: result.state,
      cells: result.state.cells,
      captured: result.state.captured,
      selected: null,
    });
  },

  playMove: async (move) => {
    const { state, animating } = get();
    if (animating || state.status !== "playing" || move.seat !== state.turn) return;
    set({ selected: move.cell });
    await get().play(move.direction);
  },

  play: async (direction) => {
    const { state, selected, animating, soundOn, instant } = get();
    if (animating || selected === null || state.status !== "playing") return;
    const me = ++runId;
    const result = applyMove(state, { seat: state.turn, cell: selected, direction }, state.version);
    set({ animating: true, selected: null });

    const done = await playEvents(state, result.events, {
      get: () => get(),
      set: (patch) => set(patch),
      soundOn,
      instant,
      cancelled: () => me !== runId, // the game was restarted mid-animation
    });
    if (!done) return;

    const next = result.state;
    set({
      state: next,
      cells: next.cells,
      captured: next.captured,
      hand: null,
      animating: false,
      history: [
        ...get().history,
        {
          n: next.moveCount,
          seat: state.turn,
          cell: selected,
          direction,
          gained: gainedBy(result.events, state.config),
        },
      ],
    });
    if (next.status === "finished" && soundOn) sfx.win();
  },
}));
