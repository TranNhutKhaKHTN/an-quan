"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { PlayerInfo } from "@/features/game/players";
import { SEAT_AVATARS, SEAT_COLORS, seatName } from "@/features/game/theme";

interface Props {
  seat: number;
  finished?: boolean;
  moveCount: number;
  /** Seconds left, when a turn timer is enabled. */
  secondsLeft?: number | null;
  players?: PlayerInfo[];
}

export function TurnIndicator({ seat, finished, moveCount, secondsLeft, players }: Props) {
  return (
    <div className="pointer-events-none flex flex-col items-center gap-1 text-center" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div
          key={finished ? "end" : seat}
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-2 rounded-full bg-[#fffaf0]/90 px-3 py-1.5 text-xs font-semibold shadow sm:text-sm"
          style={{ color: finished ? "#3b2a1a" : SEAT_COLORS[seat] }}
        >
          {finished ? (
            "Ván đấu kết thúc"
          ) : (
            <>
              <span className="text-lg leading-none">{players?.[seat]?.avatar ?? SEAT_AVATARS[seat]}</span>
              <span>Lượt: {players?.[seat]?.name ?? seatName(seat)}</span>
              {secondsLeft != null && <span className={`tabular-nums ${secondsLeft <= 5 ? "animate-pulse text-red-600" : ""}`}>· {secondsLeft}s</span>}
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <span className="text-[10px] font-medium uppercase tracking-wider text-[#fff3d6]/90 drop-shadow">
        Nước đi {moveCount}
      </span>
    </div>
  );
}
