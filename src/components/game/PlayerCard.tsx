"use client";

import { motion } from "framer-motion";
import { SEAT_AVATARS, SEAT_COLORS, seatName } from "@/features/game/theme";

interface Props {
  seat: number;
  name?: string;
  avatar?: string;
  you?: boolean;
  score: number;
  dan: number;
  quan: number;
  active: boolean;
  eliminated: boolean;
  winner?: boolean;
  online?: boolean;
}

export function PlayerCard({ seat, name, avatar, you, score, dan, quan, active, eliminated, winner, online }: Props) {
  const color = SEAT_COLORS[seat];
  return (
    <motion.div
      layout
      animate={{ scale: active ? 1.03 : 1, opacity: eliminated ? 0.55 : 1 }}
      className="flex items-center gap-2 rounded-2xl border-2 bg-[#fffaf0] px-2.5 py-2 shadow-sm"
      style={{ borderColor: active ? color : "transparent", boxShadow: active ? `0 4px 14px ${color}44` : undefined }}
    >
      <span
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
        style={{ background: `${color}22` }}
      >
        {avatar ?? SEAT_AVATARS[seat]}
        {online !== undefined && (
          <span
            className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white ${online ? "bg-green-500" : "bg-stone-400"}`}
            title={online ? "Trực tuyến" : "Ngoại tuyến"}
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color }}>
          {name ?? seatName(seat)} {you && <span className="text-[10px] font-normal opacity-70">(bạn)</span>} {winner && "👑"}
        </p>
        <p className="text-[11px] text-[#7a6246]">
          {eliminated ? "Đã bị loại" : `${dan} dân · ${quan} quan`}
        </p>
      </div>
      <motion.span
        key={score}
        initial={{ scale: 1.5 }}
        animate={{ scale: 1 }}
        className="min-w-8 text-right text-2xl font-extrabold tabular-nums"
        style={{ color }}
        aria-label={`${score} điểm`}
      >
        {score}
      </motion.span>
    </motion.div>
  );
}
