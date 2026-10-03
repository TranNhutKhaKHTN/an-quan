"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputCls } from "@/components/common/ProfileFields";
import { roomApi } from "@/features/multiplayer/services/roomApi";
import type { PublicRoomListItem } from "@/features/multiplayer/types";

export function JoinRoomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState<PublicRoomListItem[] | null>(null);
  const valid = /^[A-Z0-9]{6}$/.test(code);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    roomApi
      .listPublic()
      .then((r) => alive && setRooms(r))
      .catch(() => alive && setRooms([]));
    return () => {
      alive = false;
    };
  }, [open]);

  const go = (c: string) => {
    onOpenChange(false);
    router.push(`/lobby/${c}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Vào phòng</DialogTitle>
          <DialogDescription>Nhập mã 6 ký tự bạn bè gửi, hoặc chọn một phòng công khai.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) go(code);
          }}
          className="flex gap-2"
        >
          <input
            className={`${inputCls} text-center font-mono text-lg uppercase tracking-[0.3em]`}
            value={code}
            maxLength={6}
            placeholder="ABC123"
            aria-label="Mã phòng"
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          />
          <Button type="submit" disabled={!valid} className="h-11 rounded-xl px-5">
            Vào
          </Button>
        </form>

        <section aria-label="Phòng công khai" className="space-y-2">
          <h3 className="text-sm font-semibold">Phòng công khai</h3>
          {rooms === null ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có phòng nào đang chờ người chơi.</p>
          ) : (
            <ul className="space-y-1.5">
              {rooms.map((r) => (
                <li key={r.code}>
                  <button
                    type="button"
                    onClick={() => go(r.code)}
                    className="flex w-full items-center gap-3 rounded-xl bg-secondary px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="text-2xl">{r.hostAvatar}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.hostName}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{r.code}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {r.playerCount}/{r.playerLimit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
