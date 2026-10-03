"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { ConnectionBanner } from "@/components/lobby/ConnectionBanner";
import type { Direction } from "@/features/game/engine";
import type { PlayerInfo } from "@/features/game/players";
import { useSound } from "@/features/audio/soundStore";
import { useOnlineGame } from "@/features/game/store/onlineGameStore";
import { useRoom } from "@/features/multiplayer/hooks/useRoom";
import { roomApi } from "@/features/multiplayer/services/roomApi";
import { ApiError, newIdempotencyKey } from "@/lib/api/client";
import { GameView } from "./GameView";

function useTick(active: boolean, ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}

export function OnlineGame({ code }: { code: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const room = useRoom(code);
  const g = useOnlineGame();
  const sound = useSound();
  const { snapshot: snap } = room;
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timeoutAsked = useRef<string | null>(null);

  useEffect(() => {
    g.setInstant(!!reduced);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // leaving the page forgets the animated view; the next visit rebuilds it from the server
  useEffect(() => {
    const { reset } = useOnlineGame.getState();
    reset();
    return reset;
  }, [code]);

  // reconcile the board with every authoritative snapshot (animates new moves)
  useEffect(() => {
    if (snap?.session) g.sync(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  // route guards
  const status = snap?.room.status;
  const isMember = snap ? Boolean(snap.you) : undefined;
  useEffect(() => {
    if (isMember === false || status === "lobby") router.replace(`/lobby/${code}`);
  }, [isMember, status, code, router]);

  const session = snap?.session;
  const deadline = session?.turnDeadline && session.state.status === "playing" ? Date.parse(session.turnDeadline) : null;
  useTick(deadline !== null);
  const secondsLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - room.serverNow()) / 1000));

  // anyone may report an expired turn; the server verifies the deadline and de-duplicates by version
  const version = session?.version;
  useEffect(() => {
    if (secondsLeft !== 0 || version === undefined) return;
    const key = `${session?.round}:${version}`;
    if (timeoutAsked.current === key) return;
    timeoutAsked.current = key;
    const t = setTimeout(
      () =>
        roomApi
          .timeout(code, version)
          .then(room.accept)
          .catch(() => {
            timeoutAsked.current = null; // allow another attempt on the next tick
          }),
      800 + Math.random() * 600, // spread out so clients don't all fire together
    );
    return () => clearTimeout(t);
  }, [secondsLeft, version, session?.round, code, room.accept]);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === "STALE_VERSION") setNotice("Trạng thái ván vừa thay đổi, đã đồng bộ lại.");
      else setNotice(e instanceof ApiError ? e.message : "Có lỗi xảy ra.");
      void room.refresh();
    },
    [room],
  );

  if (room.load === "notfound")
    return (
      <div className="on-bg mx-auto my-20 w-fit space-y-3 py-6 text-center">
        <p className="font-semibold">Không tìm thấy phòng {code}</p>
        <Link href="/" className="underline">
          Về trang chủ
        </Link>
      </div>
    );
  const shown = g.shown;
  if (!snap || !session || !shown || !snap.you)
    return (
      <div className="on-bg mx-auto my-10 w-fit p-4 text-center text-[#4a3320]" role="status">
        {room.error ?? "Đang tải ván đấu…"}
      </div>
    );

  const mySeat = snap.you.seat;
  const players: PlayerInfo[] = snap.players.map((p) => ({
    name: p.name,
    avatar: p.avatar,
    online: room.presence ? room.presence.has(p.seat) || p.seat === mySeat : p.online,
  }));
  const finished = shown.status === "finished";
  const eliminated = shown.eliminated[mySeat];
  const inSync = shown.version === session.version;
  const myTurn = !finished && shown.turn === mySeat && !eliminated;
  const controllable = myTurn && inSync && !g.animating && !pending ? mySeat : null;
  const turnName = players[shown.turn]?.name;

  const statusText = finished
    ? "Ván đấu đã kết thúc."
    : g.animating
      ? "Đang rải quân…"
      : pending
        ? "Đang gửi nước đi…"
        : eliminated
          ? "Bạn đã bị loại, bạn có thể xem tiếp ván đấu."
          : myTurn
            ? "Đến lượt bạn: chọn một ô dân đang sáng."
            : `Chờ ${turnName} đi…`;

  const rematchVotes = snap.players.filter((p) => p.wantsRematch).length;
  const iAsked = snap.players.find((p) => p.seat === mySeat)?.wantsRematch ?? false;
  const requestRematch = () =>
    roomApi
      .rematch(code)
      .then(room.accept)
      .catch(fail);

  return (
    <GameView
      state={shown}
      frame={{ cells: g.cells, captured: g.captured, hand: g.hand, floaters: g.floaters }}
      animating={g.animating}
      selected={g.selected}
      controllableSeat={controllable}
      history={g.history}
      players={players}
      youSeat={mySeat}
      secondsLeft={secondsLeft}
      turnSeconds={snap.room.settings.turnSeconds}
      statusText={statusText}
      banner={
        <>
          <ConnectionBanner connection={room.connection} error={room.error} onRetry={room.refresh} />
          {notice && (
            <p role="status" className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900" onClick={() => setNotice(null)}>
              {notice}
            </p>
          )}
        </>
      }
      headerExtra={
        <span className="rounded-full bg-secondary px-3 py-1 font-mono text-sm tracking-widest" aria-label="Mã phòng">
          {code}
        </span>
      }
      soundOn={sound.on}
      onToggleSound={sound.toggle}
      onSelect={g.select}
      onPlay={(direction: Direction) => {
        if (g.selected === null || pending) return;
        setPending(true);
        setNotice(null);
        roomApi
          .move(code, {
            cell: g.selected,
            direction,
            expectedVersion: shown.version,
            idempotencyKey: newIdempotencyKey(),
          })
          .then(room.accept)
          .catch(fail)
          .finally(() => setPending(false));
      }}
      canSurrender={!eliminated}
      onSurrender={() => {
        if (window.confirm("Bạn chắc chắn muốn đầu hàng?")) roomApi.surrender(code).then(room.accept).catch(fail);
      }}
      onRestart={finished ? requestRematch : undefined}
      onExit={() => router.push("/")}
      gameKey={session.round}
      onRematch={requestRematch}
      rematchLabel={iAsked ? `Đang chờ đối thủ (${rematchVotes}/${snap.room.playerLimit})` : "Chơi lại"}
      rematchDisabled={iAsked}
      endReason={snap.result?.reason ?? shown.endReason}
      finalScores={snap.result?.scores}
    />
  );
}
