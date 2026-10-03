"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildLayout, type Cell, type Direction, type RuleConfig } from "@/features/game/engine";
import { boardGeometry } from "@/features/game/geometry";
import type { PlayerInfo } from "@/features/game/players";
import { seatName } from "@/features/game/theme";
import type { Floater } from "@/features/game/animation";
import { DirectionBubble } from "./DirectionBubble";
import { GameHouse } from "./GameHouse";
import { TurnIndicator } from "./TurnIndicator";

interface Props {
  config: RuleConfig;
  cells: Cell[];
  turn: number;
  moveCount: number;
  finished: boolean;
  selected: number | null;
  /** Seat allowed to interact right now (null = nobody, e.g. animating or not your turn). */
  controllableSeat: number | null;
  hand: { cell: number; count: number } | null;
  floaters: Floater[];
  onSelect: (cell: number) => void;
  /** When set, direction arrows are shown next to the selected house. */
  onPickDirection?: (d: Direction) => void;
  secondsLeft?: number | null;
  turnSeconds?: number;
  players?: PlayerInfo[];
}

export function GameBoard({
  config,
  cells,
  turn,
  moveCount,
  finished,
  selected,
  controllableSeat,
  hand,
  floaters,
  onSelect,
  onPickDirection,
  secondsLeft,
  turnSeconds,
  players,
}: Props) {
  const layout = useMemo(() => buildLayout(config), [config]);
  const geo = useMemo(() => boardGeometry(config), [config]);
  const maxWidth = config.playerCount === 2 ? "max-w-3xl" : "max-w-xl";

  return (
    <div
      className={`wood-board relative mx-auto w-full ${maxWidth} rounded-[2rem] border-4 border-[#6b4423]/70`}
      style={{ aspectRatio: String(geo.aspect) }}
      role="group"
      aria-label={`Bàn cờ ${config.playerCount} người chơi`}
    >
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${geo.center.x}%`, top: `${geo.center.y}%` }}
      >
        <TurnIndicator seat={turn} finished={finished} moveCount={moveCount} secondsLeft={secondsLeft} turnSeconds={turnSeconds} players={players} />
      </div>

      {layout.map((l) => {
        const p = geo.positions[l.index];
        const cell = cells[l.index];
        const selectable =
          l.kind === "house" && l.owner === controllableSeat && l.owner === turn && cell.dan > 0 && !finished;
        const name = l.kind === "quan" ? "Ô quan" : `Ô ${l.index} của ${players?.[l.owner!]?.name ?? seatName(l.owner!)}`;
        return (
          <GameHouse
            key={l.index}
            kind={l.kind}
            owner={l.owner}
            cell={cell}
            x={p.x}
            y={p.y}
            size={l.kind === "quan" ? geo.quanSize : geo.houseSize}
            label={`${name}: ${cell.dan} dân${cell.quan ? `, ${cell.quan} quan` : ""}`}
            selectable={selectable}
            selected={selected === l.index}
            onSelect={() => onSelect(l.index)}
          />
        );
      })}

      {onPickDirection && selected !== null && (
        <DirectionBubble key={selected} geo={geo} cell={selected} onPick={onPickDirection} />
      )}

      {hand && hand.count > 0 && (
        <motion.div
          key="hand"
          layout
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[170%] rounded-full bg-[#fffaf0] px-2 py-0.5 text-xs font-bold text-[#3b2a1a] shadow-lg"
          animate={{ left: `${geo.positions[hand.cell].x}%`, top: `${geo.positions[hand.cell].y}%` }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
        >
          ✋ {hand.count}
        </motion.div>
      )}

      <AnimatePresence>
        {floaters.map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: 1, y: -34, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 px-2 py-0.5 text-sm font-extrabold text-[#5a3d22] shadow-lg"
            style={{ left: `${geo.positions[f.cell].x}%`, top: `${geo.positions[f.cell].y}%` }}
          >
            {f.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
