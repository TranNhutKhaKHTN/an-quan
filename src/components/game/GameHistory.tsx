"use client";

import { useEffect, useRef } from "react";
import type { HistoryItem } from "@/features/game/history";
import type { PlayerInfo } from "@/features/game/players";
import { SEAT_COLORS, seatName } from "@/features/game/theme";

export function GameHistory({ items, players }: { items: HistoryItem[]; players?: PlayerInfo[] }) {
  const list = useRef<HTMLOListElement>(null);
  // Keep the newest move in view by scrolling the list itself. scrollIntoView would also scroll
  // the whole page (down to this card on mobile) after every turn.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);
  return (
    <div className="rounded-2xl border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">Lịch sử nước đi</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có nước đi nào.</p>
      ) : (
        <ol ref={list} className="max-h-48 space-y-1 overflow-y-auto pr-1 text-xs">
          {items.map((m) => (
            <li key={m.n} className="flex items-center gap-2">
              <span className="w-6 text-right tabular-nums text-muted-foreground">#{m.n}</span>
              <span className="font-medium" style={{ color: SEAT_COLORS[m.seat] }}>
                {players?.[m.seat]?.name ?? seatName(m.seat)}
              </span>
              <span>
                {m.kind === "surrender" ? "đầu hàng 🏳️" : `ô ${m.cell} ${m.direction === 1 ? "↺" : "↻"}${m.kind === "timeout" ? " ⏱" : ""}`}
              </span>
              {m.gained > 0 && <span className="ml-auto font-bold text-amber-700">+{m.gained}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
