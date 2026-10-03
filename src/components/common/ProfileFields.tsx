"use client";

import { AvatarPicker } from "./AvatarPicker";
import type { StoredProfile } from "@/features/multiplayer/storage";

export const inputCls =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

export function ProfileFields({ value, onChange }: { value: StoredProfile; onChange: (p: StoredProfile) => void }) {
  return (
    <div className="space-y-3">
      <label className="block space-y-1.5 text-sm font-medium">
        Tên hiển thị
        <input
          className={inputCls}
          value={value.name}
          maxLength={24}
          placeholder="Ví dụ: Bé Na"
          autoComplete="nickname"
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      <div className="space-y-1.5 text-sm font-medium">
        <span>Avatar</span>
        <AvatarPicker value={value.avatar} onChange={(avatar) => onChange({ ...value, avatar })} />
      </div>
    </div>
  );
}
