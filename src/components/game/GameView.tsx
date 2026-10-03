"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { MotionConfig } from "framer-motion";
import type { Frame } from "@/features/game/animation";
import { scores, type Direction, type EndReason, type GameState } from "@/features/game/engine";
import { boardGeometry } from "@/features/game/geometry";
import type { HistoryItem } from "@/features/game/history";
import { defaultPlayers, type PlayerInfo } from "@/features/game/players";
import { GameBoard } from "./GameBoard";
import { DirectionPicker, GameControls } from "./GameControls";
import { GameHistory } from "./GameHistory";
import { GameResultDialog } from "./GameResultDialog";
import { RulesDialog } from "./RulesDialog";
import { ScoreBoard } from "./ScoreBoard";

export interface GameViewProps {
  state: GameState;
  frame: Frame;
  animating: boolean;
  selected: number | null;
  /** Seat that may act right now, or null (animating, not your turn, spectating...). */
  controllableSeat: number | null;
  history: HistoryItem[];
  players?: PlayerInfo[];
  youSeat?: number | null;
  secondsLeft?: number | null;
  /** Full length of a turn, for the countdown bar. */
  turnSeconds?: number;
  /** One line under the board when no house is selected. */
  statusText: string;
  /** Header content (mode switcher, room code...). */
  headerExtra?: ReactNode;
  soundOn: boolean;
  onToggleSound: () => void;
  onSelect: (cell: number | null) => void;
  onPlay: (d: Direction) => void;
  onSurrender: () => void;
  onRestart?: () => void;
  onExit: () => void;
  /** Result dialog. */
  gameKey: string | number;
  onRematch: () => void;
  rematchLabel?: string;
  rematchDisabled?: boolean;
  /** Disable surrender (e.g. spectators / already eliminated). */
  canSurrender?: boolean;
  endReason: EndReason | null;
  /** Authoritative final scores when available (e.g. from the server). */
  finalScores?: number[];
  /** Extra content shown above the board (e.g. connection banner). */
  banner?: ReactNode;
}

export function GameView(p: GameViewProps) {
  const { state } = p;
  const [rules, setRules] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | number | null>(null);
  const finished = state.status === "finished";
  const players = p.players ?? defaultPlayers(state.config.playerCount);
  const turnName = players[state.turn]?.name;

  const angles = useMemo(() => {
    const geo = boardGeometry(state.config);
    const n = state.cells.length;
    const out = { 1: 0, [-1]: 0 } as Record<Direction, number>;
    if (p.selected === null) return out;
    for (const d of [1, -1] as Direction[]) {
      const a = geo.positions[p.selected];
      const b = geo.positions[(p.selected + d + n) % n];
      out[d] = (Math.atan2((b.y - a.y) / geo.aspect, b.x - a.x) * 180) / Math.PI;
    }
    return out;
  }, [p.selected, state.config, state.cells.length]);

  return (
    <MotionConfig reducedMotion="user">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 lg:grid lg:grid-cols-[1fr_320px] lg:items-start">
        <section className="flex flex-col gap-4">
          <header className="flex items-center justify-between gap-2">
            <Link href="/" className="on-bg text-lg font-extrabold text-[#6b4423]">
              Ô Ăn Quan
            </Link>
            {p.headerExtra}
          </header>
          {p.banner}

          <GameBoard
            config={state.config}
            cells={p.frame.cells}
            turn={state.turn}
            moveCount={state.moveCount}
            finished={finished}
            selected={p.selected}
            controllableSeat={p.controllableSeat}
            hand={p.frame.hand}
            floaters={p.frame.floaters}
            onSelect={(cell) => p.onSelect(p.selected === cell ? null : cell)}
            secondsLeft={p.secondsLeft}
            turnSeconds={p.turnSeconds}
            players={players}
          />

          <div className="min-h-[5.5rem]">
            {!finished && p.selected !== null && !p.animating && p.controllableSeat !== null ? (
              <DirectionPicker
                angles={angles}
                disabled={p.animating}
                onPick={p.onPlay}
                hint={`${turnName}: chọn hướng rải từ ô ${p.selected}`}
              />
            ) : (
              <p className="on-bg mx-auto w-fit max-w-full text-center text-sm text-[#4a3320]" aria-live="polite">
                {p.statusText}
              </p>
            )}
          </div>

          <GameControls
            soundOn={p.soundOn}
            canSurrender={(p.canSurrender ?? true) && !finished && !p.animating}
            onToggleSound={p.onToggleSound}
            onRules={() => setRules(true)}
            onRestart={p.onRestart}
            onSurrender={p.onSurrender}
          />
        </section>

        <aside className="flex flex-col gap-3">
          <ScoreBoard
            config={state.config}
            captured={p.frame.captured}
            turn={state.turn}
            eliminated={state.eliminated}
            winners={state.winners}
            finished={finished}
            players={players}
            youSeat={p.youSeat}
          />
          <GameHistory items={p.history} players={players} />
        </aside>
      </main>

      <RulesDialog open={rules} onOpenChange={setRules} />
      <GameResultDialog
        open={finished && dismissedKey !== p.gameKey && !p.animating}
        scores={p.finalScores ?? scores(state)}
        winners={state.winners}
        reason={p.endReason}
        players={players}
        onRematch={p.onRematch}
        rematchLabel={p.rematchLabel}
        rematchDisabled={p.rematchDisabled}
        onClose={() => setDismissedKey(p.gameKey)}
        onExit={p.onExit}
      />
    </MotionConfig>
  );
}
