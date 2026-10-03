"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EndReason } from "@/features/game/engine";
import type { PlayerInfo } from "@/features/game/players";
import { SEAT_AVATARS, SEAT_COLORS, seatName } from "@/features/game/theme";

interface Props {
  open: boolean;
  scores: number[];
  winners: number[];
  reason: EndReason | null;
  onRematch: () => void;
  onClose: () => void;
  onExit: () => void;
  rematchLabel?: string;
  rematchDisabled?: boolean;
  players?: PlayerInfo[];
}

const REASONS: Record<EndReason, string> = {
  "quan-captured": "Tất cả quan đã bị ăn.",
  "last-player": "Chỉ còn một người chơi.",
  surrender: "Có người đã đầu hàng.",
};

export function GameResultDialog({ open, scores, winners, reason, onRematch, onClose, onExit, rematchLabel, rematchDisabled, players }: Props) {
  const draw = winners.length > 1;
  const ranking = scores.map((s, seat) => ({ seat, s })).sort((a, b) => b.s - a.s);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="overflow-hidden text-center">
        <DialogHeader className="items-center">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
            className="text-5xl"
          >
            {draw ? "🤝" : "🏆"}
          </motion.div>
          <DialogTitle className="text-xl">
            {draw ? "Hòa!" : `${players?.[winners[0]]?.name ?? seatName(winners[0])} chiến thắng!`}
          </DialogTitle>
          <DialogDescription>{reason && REASONS[reason]}</DialogDescription>
        </DialogHeader>
        <ol className="space-y-1.5 text-left">
          {ranking.map(({ seat, s }, i) => (
            <motion.li
              key={seat}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.1 }}
              className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2"
            >
              <span className="w-5 text-muted-foreground">{i + 1}</span>
              <span className="text-lg">{players?.[seat]?.avatar ?? SEAT_AVATARS[seat]}</span>
              <span className="flex-1 font-medium" style={{ color: SEAT_COLORS[seat] }}>
                {players?.[seat]?.name ?? seatName(seat)} {winners.includes(seat) && "👑"}
              </span>
              <span className="text-lg font-bold tabular-nums">{s}</span>
            </motion.li>
          ))}
        </ol>
        <div className="flex gap-2">
          <Button className="h-11 flex-1 rounded-xl" onClick={onRematch} disabled={rematchDisabled}>
            {rematchLabel ?? "Chơi lại"}
          </Button>
          <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={onExit}>
            Về trang chủ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
