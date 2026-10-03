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
import { useSound } from "@/features/audio/soundStore";
import { sfx } from "../sound";
import { turnDeadline } from "../timer";

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
  /** When the current turn runs out (ms epoch); null before the first start, after the end, or while paused. */
  turnDeadline: number | null;
  /** Increments on every new game; lets the UI reset per-game state. */
  gameId: number;
  /** Set to true to skip step delays (reduced motion). */
  instant: boolean;

  start: (players: PlayerCount) => void;
  select: (cell: number | null) => void;
  play: (direction: Direction) => Promise<void>;
  /** Plays a complete move (used by bots): selects the house, then sows. */
  playMove: (move: Move, kind?: "move" | "timeout") => Promise<void>;
  surrender: (seat: Seat) => void;
  setInstant: (v: boolean) => void;
}

let runId = 0;
/** How the next move is recorded in the history (a timeout is shown differently). */
let nextKind: "move" | "timeout" = "move";

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

const startFresh = (players: PlayerCount) => ({ ...fresh(players), turnDeadline: turnDeadline() });

export const useLocalGame = create<LocalGameStore>((set, get) => ({
  ...fresh(2),
  turnDeadline: null,
  gameId: 0,
  instant: false,

  start: (players) => {
    runId++;
    set({ ...startFresh(players), gameId: get().gameId + 1 });
  },

  select: (cell) => {
    const { state, animating } = get();
    if (animating || state.status !== "playing") return;
    set({ selected: cell !== null && state.cells[cell]?.dan > 0 ? cell : null });
  },

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
      // if the surrendering seat was on turn, the next player gets a fresh clock
      turnDeadline:
        result.state.status !== "playing"
          ? null
          : result.state.turn !== state.turn
            ? turnDeadline()
            : get().turnDeadline,
    });
  },

  playMove: async (move, kind = "move") => {
    const { state, animating } = get();
    if (animating || state.status !== "playing" || move.seat !== state.turn) return;
    nextKind = kind;
    set({ selected: move.cell });
    await get().play(move.direction);
  },

  play: async (direction) => {
    const { state, selected, animating, instant } = get();
    const soundOn = useSound.getState().on;
    if (animating || selected === null || state.status !== "playing") return;
    const me = ++runId;
    const kind = nextKind;
    nextKind = "move";
    const result = applyMove(state, { seat: state.turn, cell: selected, direction }, state.version);
    // no clock while the pieces are moving; the next turn's clock starts when they stop
    set({ animating: true, selected: null, turnDeadline: null });

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
      turnDeadline: next.status === "playing" ? turnDeadline() : null,
      history: [
        ...get().history,
        {
          n: next.moveCount,
          seat: state.turn,
          cell: selected,
          direction,
          kind,
          gained: gainedBy(result.events, state.config),
        },
      ],
    });
    if (next.status === "finished" && soundOn) sfx.win();
  },
}));
