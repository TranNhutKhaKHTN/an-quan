"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { Direction } from "@/features/game/engine";
import type { BoardGeometry } from "@/features/game/geometry";

interface Props {
  geo: BoardGeometry;
  /** Index of the selected house. */
  cell: number;
  onPick: (d: Direction) => void;
}

const LABEL: Record<Direction, string> = {
  1: "Rải ngược chiều kim đồng hồ",
  [-1]: "Rải theo chiều kim đồng hồ",
};

/** Arrow button size in px, and how far (px) its centre sits beyond the house's edge. */
const BUTTON = 38;
const GAP = 18;

/**
 * Two arrows, one on each side of the selected house, on the side its pieces will travel to.
 * On a horizontal row that is simply left and right; on the vertical or slanted sides of the
 * 3- and 4-player boards they sit above/below or along the slant. Each arrow points the way
 * its pieces will go.
 */
export function DirectionBubble({ geo, cell, onPick }: Props) {
  const n = geo.positions.length;
  const here = geo.positions[cell];
  const sides = ([1, -1] as Direction[]).map((d) => {
    const b = geo.positions[(cell + d + n) % n];
    // screen vector in width units (y percentages are of the board height)
    const vx = b.x - here.x;
    const vy = (b.y - here.y) / geo.aspect;
    const len = Math.hypot(vx, vy) || 1;
    return { d, ux: vx / len, uy: vy / len };
  });

  return (
    // same box as the house, so offsets can be expressed relative to the house itself
    <div
      role="group"
      aria-label="Chọn hướng rải"
      className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${here.x}%`, top: `${here.y}%`, width: `${geo.houseSize}%`, aspectRatio: "1" }}
    >
      {sides.map(({ d, ux, uy }) => (
        <motion.button
          key={d}
          type="button"
          aria-label={LABEL[d]}
          title={LABEL[d]}
          onClick={() => onPick(d)}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 460, damping: 24 }}
          className="pointer-events-auto absolute flex cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-[#fffaf0] outline-none focus-visible:ring-4 focus-visible:ring-primary/50"
          style={{
            width: BUTTON,
            height: BUTTON,
            left: `calc(50% + ${ux} * (50% + ${GAP}px) - ${BUTTON / 2}px)`,
            top: `calc(50% + ${uy} * (50% + ${GAP}px) - ${BUTTON / 2}px)`,
          }}
        >
          <ArrowRight className="size-5" style={{ transform: `rotate(${(Math.atan2(uy, ux) * 180) / Math.PI}deg)` }} />
        </motion.button>
      ))}
    </div>
  );
}
