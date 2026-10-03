"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Cell } from "@/features/game/engine";
import { SEAT_COLORS } from "@/features/game/theme";
import { GamePiece } from "./GamePiece";

interface Props {
  kind: "house" | "quan";
  owner: number | null;
  cell: Cell;
  x: number;
  y: number;
  size: number;
  label: string;
  selectable: boolean;
  selected: boolean;
  onSelect?: () => void;
}

const MAX_VISIBLE = 14;

export function GameHouse({ kind, owner, cell, x, y, size, label, selectable, selected, onSelect }: Props) {
  const color = owner === null ? "#8a6a2f" : SEAT_COLORS[owner];
  const visible = Math.min(cell.dan, MAX_VISIBLE);
  return (
    <motion.button
      type="button"
      disabled={!selectable}
      onClick={onSelect}
      aria-label={label}
      aria-pressed={selected}
      animate={{
        scale: selected ? 1.12 : 1,
        boxShadow: selectable
          ? [`0 0 0 2px ${color}`, `0 0 0 6px ${color}55`, `0 0 0 2px ${color}`]
          : `0 0 0 0px ${color}00`,
      }}
      transition={{
        scale: { type: "spring", stiffness: 300, damping: 20 },
        boxShadow: selectable ? { duration: 1.6, repeat: Infinity } : { duration: 0.2 },
      }}
      className="pit absolute -translate-x-1/2 -translate-y-1/2 rounded-full text-[length:var(--fs)] outline-none focus-visible:ring-4 focus-visible:ring-white disabled:cursor-default"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}%`,
        aspectRatio: "1",
        cursor: selectable ? "pointer" : "default",
        ["--fs" as string]: "clamp(10px, 2.6vw, 18px)",
      }}
    >
      <AnimatePresence>
        {kind === "quan" && cell.quan > 0 && <GamePiece key="quan" kind="quan" index={0} />}
        {Array.from({ length: visible }, (_, i) => (
          <GamePiece key={i} kind="dan" index={i} tone={owner ?? 0} />
        ))}
      </AnimatePresence>
      {cell.dan > 0 && (
        <span
          className="absolute -bottom-1 -right-1 flex min-h-[1.5em] min-w-[1.5em] items-center justify-center rounded-full px-1 text-[0.75em] font-bold leading-none text-white shadow"
          style={{ background: color }}
        >
          {cell.dan}
        </span>
      )}
    </motion.button>
  );
}
