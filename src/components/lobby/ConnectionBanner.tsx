"use client";

import type { ConnectionState } from "@/features/multiplayer/services/realtime";

interface Props {
  connection: ConnectionState;
  error: string | null;
  onRetry: () => void;
}

export function ConnectionBanner({ connection, error, onRetry }: Props) {
  if (error)
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
        <span>{error}</span>
        <button type="button" className="font-semibold underline" onClick={onRetry}>
          Thử lại
        </button>
      </div>
    );
  if (connection === "reconnecting")
    return (
      <div role="status" className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Đang kết nối lại… Trạng thái ván sẽ được đồng bộ ngay khi có mạng.
      </div>
    );
  return null;
}
