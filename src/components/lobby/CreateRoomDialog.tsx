"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfileFields } from "@/components/common/ProfileFields";
import { roomApi } from "@/features/multiplayer/services/roomApi";
import { loadProfile, saveProfile, saveToken, type StoredProfile } from "@/features/multiplayer/storage";
import { ApiError, newIdempotencyKey } from "@/lib/api/client";

const TIMERS = [
  { value: 0, label: "Không giới hạn" },
  { value: 30, label: "30 giây" },
  { value: 60, label: "60 giây" },
];

export function CreateRoomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile>(() => loadProfile());
  const [playerLimit, setPlayerLimit] = useState(2);
  const [isPublic, setIsPublic] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // one key per dialog session: a double click or network retry cannot create two rooms
  const [key] = useState(newIdempotencyKey);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.name.trim()) return setError("Hãy nhập tên hiển thị.");
    setBusy(true);
    setError(null);
    try {
      const res = await roomApi.create({
        playerLimit,
        displayName: profile.name,
        avatar: profile.avatar,
        isPublic,
        turnSeconds,
        idempotencyKey: key,
      });
      saveProfile(profile);
      saveToken(res.code, res.sessionToken);
      router.push(`/lobby/${res.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tạo được phòng.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Tạo phòng</DialogTitle>
          <DialogDescription>Tạo phòng rồi chia sẻ mã hoặc đường dẫn cho bạn bè.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <ProfileFields value={profile} onChange={setProfile} />

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Số người chơi</legend>
            <div className="grid grid-cols-2 gap-2">
              {[2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={playerLimit === n}
                  onClick={() => setPlayerLimit(n)}
                  className={`h-11 rounded-xl border text-sm font-semibold ${
                    playerLimit === n ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted"
                  }`}
                >
                  {n} người · {n === 2 ? "bàn chữ nhật" : "bàn tam giác"}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1.5 text-sm font-medium">
            Thời gian mỗi lượt
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base"
              value={turnSeconds}
              onChange={(e) => setTurnSeconds(Number(e.target.value))}
            >
              {TIMERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-3 rounded-xl bg-secondary px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5 accent-[var(--primary)]"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <span>
              <span className="font-medium">Phòng công khai</span>
              <span className="block text-xs text-muted-foreground">
                Hiện trong danh sách để mọi người cùng vào. Phòng riêng chỉ vào được bằng mã hoặc link.
              </span>
            </span>
          </label>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl text-base">
            {busy ? "Đang tạo…" : "Tạo phòng"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
