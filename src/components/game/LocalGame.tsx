"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { BOT_LEVELS, chooseMove, type BotLevel } from "@/features/game/bot";
import type { PlayerCount } from "@/features/game/engine";
import { defaultPlayers, type PlayerInfo } from "@/features/game/players";
import { useLocalGame } from "@/features/game/store/localGameStore";
import { SEAT_AVATARS, seatName } from "@/features/game/theme";
import { GameView } from "./GameView";

const HUMAN_SEAT = 0;
/** Pause before a bot answers, so its move is easy to follow. */
const BOT_THINK_MS = 700;

interface Props {
  players: PlayerCount;
  /** When set, seat 0 is the human and every other seat is a bot of this level. */
  botLevel?: BotLevel;
}

export function LocalGame({ players, botLevel }: Props) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const g = useLocalGame();
  const vsBot = botLevel !== undefined;

  useEffect(() => {
    g.start(players);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, botLevel]);
  useEffect(() => {
    g.setInstant(!!reduced);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const { state } = g;
  const finished = state.status === "finished";
  const botTurn = vsBot && !finished && state.turn !== HUMAN_SEAT && !g.animating;

  // let the bot move whenever it is a bot's turn and the board is idle
  useEffect(() => {
    if (!botTurn || !botLevel) return;
    const t = setTimeout(
      () => {
        const current = useLocalGame.getState().state;
        if (current.status === "playing" && current.turn !== HUMAN_SEAT) {
          void useLocalGame.getState().playMove(chooseMove(current, botLevel));
        }
      },
      reduced ? 30 : BOT_THINK_MS,
    );
    return () => clearTimeout(t);
  }, [botTurn, botLevel, state.version, state.moveCount, reduced]);

  const playerInfo = useMemo<PlayerInfo[]>(
    () =>
      vsBot
        ? Array.from({ length: players }, (_, seat) =>
            seat === HUMAN_SEAT
              ? { name: "Bạn", avatar: SEAT_AVATARS[0] }
              : { name: players === 2 ? "Máy" : `Máy ${seat}`, avatar: "🤖" },
          )
        : defaultPlayers(players),
    [vsBot, players],
  );

  if (state.config.playerCount !== players)
    return <div className="p-10 text-center text-muted-foreground">Đang chuẩn bị bàn cờ…</div>;

  const base = vsBot ? "/play/bot" : "/play/local";
  const query = (n: number, level?: BotLevel) => `${base}?players=${n}${level ? `&level=${level}` : ""}`;
  const turnName = playerInfo[state.turn]?.name ?? seatName(state.turn);
  const humanEliminated = vsBot && state.eliminated[HUMAN_SEAT];

  const statusText = finished
    ? "Ván đấu đã kết thúc."
    : g.animating
      ? "Đang rải quân…"
      : vsBot
        ? humanEliminated
          ? "Bạn đã bị loại, máy đang chơi tiếp."
          : state.turn === HUMAN_SEAT
            ? "Đến lượt bạn: chọn một ô dân đang sáng."
            : `${turnName} đang suy nghĩ…`
        : `${seatName(state.turn)}: chọn một ô dân đang sáng của bạn.`;

  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 font-medium ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`;

  return (
    <GameView
      state={state}
      frame={{ cells: g.cells, captured: g.captured, hand: g.hand, floaters: g.floaters }}
      animating={g.animating}
      selected={g.selected}
      controllableSeat={g.animating ? null : vsBot ? (state.turn === HUMAN_SEAT ? HUMAN_SEAT : null) : state.turn}
      history={g.history}
      players={playerInfo}
      statusText={statusText}
      headerExtra={
        <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center">
          {vsBot && (
            <nav className="flex gap-1 rounded-full bg-secondary p-1 text-sm" aria-label="Độ khó">
              {BOT_LEVELS.map((l) => (
                <Link key={l.level} href={query(players, l.level)} className={pill(l.level === botLevel)} aria-current={l.level === botLevel}>
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
          <nav className="flex gap-1 rounded-full bg-secondary p-1 text-sm" aria-label="Số người chơi">
            {([2, 3, 4] as const).map((n) => (
              <Link key={n} href={query(n, botLevel)} className={pill(n === players)} aria-current={n === players}>
                {n} người
              </Link>
            ))}
          </nav>
        </div>
      }
      soundOn={g.soundOn}
      onToggleSound={g.toggleSound}
      onSelect={g.select}
      onPlay={(d) => g.play(d)}
      canSurrender={vsBot ? !humanEliminated : true}
      onSurrender={() => {
        const seat = vsBot ? HUMAN_SEAT : state.turn;
        if (window.confirm(`${vsBot ? "Bạn" : seatName(seat)} đầu hàng?`)) g.surrender(seat);
      }}
      onRestart={() => g.start(players)}
      onExit={() => router.push("/")}
      gameKey={g.gameId}
      onRematch={() => g.start(players)}
      endReason={state.endReason}
    />
  );
}
