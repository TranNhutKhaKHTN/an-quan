"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileFields } from "@/components/common/ProfileFields";
import { SEAT_COLORS } from "@/features/game/theme";
import { useRoom } from "@/features/multiplayer/hooks/useRoom";
import { roomApi } from "@/features/multiplayer/services/roomApi";
import type { RoomSnapshot } from "@/features/multiplayer/types";
import { loadProfile, saveProfile, saveToken, clearToken, type StoredProfile } from "@/features/multiplayer/storage";
import { ApiError } from "@/lib/api/client";
import { ConnectionBanner } from "./ConnectionBanner";
import { ShareRoom } from "./ShareRoom";

const MODE_NAMES: Record<number, string> = { 2: "Bàn chữ nhật (cổ điển)", 3: "Bàn tam giác", 4: "Bàn vuông" };

function Slots({ snap, presence }: { snap: RoomSnapshot; presence: Set<number> | null }) {
  return (
    <ul className="grid gap-2" aria-label="Người chơi">
      {Array.from({ length: snap.room.playerLimit }, (_, seat) => {
        const p = snap.players.find((x) => x.seat === seat);
        if (!p)
          return (
            <li key={seat} className="flex h-16 items-center justify-center rounded-2xl border-2 border-dashed text-sm text-muted-foreground">
              <span className="animate-pulse">Đang chờ người chơi…</span>
            </li>
          );
        const online = presence ? presence.has(seat) || snap.you?.seat === seat : p.online;
        return (
          <li
            key={seat}
            className="flex h-16 items-center gap-3 rounded-2xl border-2 bg-card px-3"
            style={{ borderColor: SEAT_COLORS[seat] }}
          >
            <span className="relative flex size-11 items-center justify-center rounded-full text-2xl" style={{ background: `${SEAT_COLORS[seat]}22` }}>
              {p.avatar}
              <span
                className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white ${online ? "bg-green-500" : "bg-stone-400"}`}
                title={online ? "Trực tuyến" : "Ngoại tuyến"}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 truncate font-semibold">
                {p.name}
                {p.isOwner && <Crown className="size-4 text-amber-500" aria-label="Chủ phòng" />}
                {snap.you?.seat === seat && <span className="text-xs font-normal text-muted-foreground">(bạn)</span>}
              </span>
              <span className="text-xs text-muted-foreground">{online ? "Trực tuyến" : "Ngoại tuyến"}</span>
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.ready ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-600"}`}
            >
              {p.isOwner ? "Chủ phòng" : p.ready ? "Sẵn sàng" : "Chưa sẵn sàng"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function JoinPanel({ code, snap, onJoined }: { code: string; snap: RoomSnapshot; onJoined: (s: RoomSnapshot) => void }) {
  const [profile, setProfile] = useState<StoredProfile>(() => loadProfile());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = snap.players.length >= snap.room.playerLimit;
  const closed = snap.room.status !== "lobby";

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.name.trim()) return setError("Hãy nhập tên hiển thị.");
    setBusy(true);
    setError(null);
    try {
      const res = await roomApi.join(code, { displayName: profile.name, avatar: profile.avatar });
      saveProfile(profile);
      saveToken(code, res.sessionToken);
      onJoined(res.snapshot);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "ROOM_FULL"
            ? "Phòng đã đủ người."
            : err.code === "ROOM_NOT_JOINABLE"
              ? "Ván đấu đã bắt đầu."
              : err.message
          : "Không vào được phòng.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">Bạn được mời vào phòng</p>
        <p className="font-mono text-3xl font-extrabold tracking-[0.25em] text-[#6b4423]">{code}</p>
        <p className="mt-1 text-sm">
          {MODE_NAMES[snap.room.playerLimit]} · {snap.players.length}/{snap.room.playerLimit} người
        </p>
      </div>
      <Slots snap={snap} presence={null} />
      {closed || full ? (
        <p role="status" className="rounded-xl bg-amber-100 px-3 py-2 text-center text-sm text-amber-900">
          {closed ? "Ván đấu đã bắt đầu, bạn không thể vào lúc này." : "Phòng đã đủ người."}
        </p>
      ) : (
        <form onSubmit={join} className="space-y-4 rounded-2xl border bg-card p-4">
          <ProfileFields value={profile} onChange={setProfile} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl text-base">
            {busy ? "Đang vào…" : "Vào phòng"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function RoomLobby({ code }: { code: string }) {
  const router = useRouter();
  const room = useRoom(code);
  const { snapshot: snap } = room;
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // the game has started (or finished): move everyone to the board
  const status = snap?.room.status;
  const member = Boolean(snap?.you);
  useEffect(() => {
    if (member && (status === "playing" || status === "finished")) router.replace(`/game/${code}`);
  }, [member, status, code, router]);

  async function act(name: string, fn: () => Promise<RoomSnapshot | void>) {
    setBusy(name);
    setActionError(null);
    try {
      const res = await fn();
      if (res) room.accept(res);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Có lỗi xảy ra.");
      void room.refresh();
    } finally {
      setBusy(null);
    }
  }

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-extrabold text-[#6b4423]">
          Ô Ăn Quan
        </Link>
        <span className="text-sm text-muted-foreground">Phòng chờ</span>
      </header>
      {children}
    </main>
  );

  if (room.load === "loading") return shell(<p className="py-16 text-center text-muted-foreground">Đang tải phòng…</p>);
  if (room.load === "notfound")
    return shell(
      <div className="space-y-3 py-12 text-center">
        <p className="text-4xl">🔍</p>
        <p className="font-semibold">Không tìm thấy phòng {code}</p>
        <p className="text-sm text-muted-foreground">Phòng có thể đã đóng hoặc mã chưa đúng.</p>
        <Link href="/" className="inline-block rounded-xl bg-primary px-4 py-2 text-primary-foreground">
          Về trang chủ
        </Link>
      </div>,
    );
  if (!snap)
    return shell(<ConnectionBanner connection="connecting" error={room.error ?? "Không tải được phòng."} onRetry={room.refresh} />);

  if (!snap.you) return shell(<JoinPanel code={code} snap={snap} onJoined={room.accept} />);

  const everyoneReady = snap.players.length === snap.room.playerLimit && snap.players.every((p) => p.ready || p.isOwner);
  const me = snap.players.find((p) => p.seat === snap.you!.seat)!;
  const missing = snap.room.playerLimit - snap.players.length;

  return shell(
    <>
      <ConnectionBanner connection={room.connection} error={room.error} onRetry={room.refresh} />
      <ShareRoom code={code} />
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{MODE_NAMES[snap.room.playerLimit]}</span>
        <span className="tabular-nums" data-testid="player-count">
          {snap.players.length}/{snap.room.playerLimit} người
        </span>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {snap.room.isPublic ? "Phòng công khai" : "Phòng riêng"} ·{" "}
        {snap.room.settings.turnSeconds ? `${snap.room.settings.turnSeconds}s mỗi lượt` : "không giới hạn thời gian"}
      </p>
      <Slots snap={snap} presence={room.presence} />

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {snap.you.isOwner ? (
        <div className="space-y-1.5">
          <Button
            className="h-12 w-full rounded-xl text-base"
            disabled={!everyoneReady || busy !== null}
            onClick={() => act("start", () => roomApi.start(code))}
          >
            {busy === "start" ? "Đang bắt đầu…" : "Bắt đầu ván đấu"}
          </Button>
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            {missing > 0
              ? `Cần thêm ${missing} người chơi.`
              : !everyoneReady
                ? "Chờ mọi người bấm sẵn sàng."
                : "Mọi người đã sẵn sàng!"}
          </p>
        </div>
      ) : (
        <Button
          className="h-12 w-full rounded-xl text-base"
          variant={me.ready ? "secondary" : "default"}
          disabled={busy !== null}
          aria-pressed={me.ready}
          onClick={() => act("ready", () => roomApi.ready(code, !me.ready))}
        >
          {me.ready ? "Huỷ sẵn sàng" : "Sẵn sàng"}
        </Button>
      )}

      <Button
        variant="ghost"
        className="h-10 self-center rounded-xl text-muted-foreground"
        disabled={busy !== null}
        onClick={() =>
          act("leave", async () => {
            await roomApi.leave(code);
            clearToken(code);
            router.push("/");
          })
        }
      >
        <LogOut /> Rời phòng
      </Button>
    </>,
  );
}
