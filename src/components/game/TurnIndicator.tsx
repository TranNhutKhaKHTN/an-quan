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
  /** Full turn length, to size the countdown bar. */
  turnSeconds?: number;
  players?: PlayerInfo[];
}

export function TurnIndicator({ seat, finished, moveCount, secondsLeft, turnSeconds, players }: Props) {
  const showTimer = !finished && secondsLeft != null;
  const urgent = showTimer && secondsLeft <= 3;
  const fraction = showTimer && turnSeconds ? Math.min(1, secondsLeft / turnSeconds) : 0;
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
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {showTimer && (
        <div className="flex w-32 flex-col items-center gap-1" role="timer" aria-label={`Còn ${secondsLeft} giây`}>
          <span
            className={`rounded-full px-2.5 py-0.5 text-sm font-extrabold tabular-nums shadow ${
              urgent ? "animate-pulse bg-red-600 text-white" : "bg-[#fffaf0]/90 text-[#3b2a1a]"
            }`}
            data-testid="turn-timer"
          >
            ⏱ {secondsLeft}s
          </span>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-black/25">
            <span
              className={`block h-full rounded-full transition-[width] duration-200 ease-linear ${urgent ? "bg-red-500" : "bg-[#9bd3b0]"}`}
              style={{ width: `${fraction * 100}%` }}
            />
          </span>
        </div>
      )}

      <span className="text-[10px] font-medium uppercase tracking-wider text-[#fff3d6]/90 drop-shadow">
        Nước đi {moveCount}
      </span>
    </div>
  );
}
