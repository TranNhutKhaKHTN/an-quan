"use client";

import { motion } from "framer-motion";

interface Props {
  kind: "dan" | "quan";
  /** Index of the piece inside its house; drives a stable scatter position. */
  index: number;
  /** Tint of the piece. */
  tone?: number;
}

const DAN_COLORS = ["#f6efe0", "#e8d9b5", "#d8e6d0", "#efe2c8"];

/** Deterministic scatter inside a unit circle (golden-angle spiral). */
export function scatter(index: number): { x: number; y: number } {
  const angle = index * 2.399963;
  const r = 0.08 + 0.34 * Math.sqrt((index + 0.5) / 14);
  return { x: 50 + 50 * r * 1.9 * Math.cos(angle) * 0.9, y: 50 + 50 * r * 1.9 * Math.sin(angle) * 0.9 };
}

export function GamePiece({ kind, index, tone = 0 }: Props) {
  if (kind === "quan") {
    return (
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0, opacity: 0, y: -12 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className="absolute left-1/2 top-1/2 flex h-[62%] w-[62%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[0.8em] shadow-md"
        style={{
          background: "radial-gradient(circle at 35% 30%, #fff1a8, #e0a416 60%, #a86f06)",
          boxShadow: "0 3px 6px rgb(0 0 0 / 0.4), inset 0 -3px 5px rgb(0 0 0 / 0.25)",
        }}
        aria-hidden
      >
        ♜
      </motion.span>
    );
  }
  const { x, y } = scatter(index);
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0, y: -10 }}
      transition={{ type: "spring", stiffness: 420, damping: 20 }}
      className="absolute h-[17%] w-[17%] rounded-full"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        marginLeft: "-8.5%",
        marginTop: "-8.5%",
        background: `radial-gradient(circle at 35% 30%, #fff, ${DAN_COLORS[(index + tone) % DAN_COLORS.length]} 70%)`,
        boxShadow: "0 1px 2px rgb(0 0 0 / 0.5)",
      }}
      aria-hidden
    />
  );
}
