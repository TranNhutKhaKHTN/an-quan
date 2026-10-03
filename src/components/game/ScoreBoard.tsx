"use client";

import type { Captured, RuleConfig } from "@/features/game/engine";
import type { PlayerInfo } from "@/features/game/players";
import { PlayerCard } from "./PlayerCard";

interface Props {
  config: RuleConfig;
  captured: Captured[];
  turn: number;
  eliminated: boolean[];
  winners: number[];
  finished: boolean;
  players?: PlayerInfo[];
  youSeat?: number | null;
}

export function ScoreBoard({ config, captured, turn, eliminated, winners, finished, players, youSeat }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
      {captured.map((c, seat) => (
        <PlayerCard
          key={seat}
          seat={seat}
          name={players?.[seat]?.name}
          avatar={players?.[seat]?.avatar}
          online={players?.[seat]?.online}
          you={youSeat === seat}
          score={c.dan * config.danValue + c.quan * config.quanValue}
          dan={c.dan}
          quan={c.quan}
          active={!finished && turn === seat}
          eliminated={eliminated[seat]}
          winner={finished && winners.includes(seat)}
        />
      ))}
    </div>
  );
}
