"use client";

import { AVATARS } from "@/lib/validations/schemas";

interface Props {
  value: string;
  onChange: (avatar: (typeof AVATARS)[number]) => void;
}

export function AvatarPicker({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Avatar" className="flex flex-wrap gap-2">
      {AVATARS.map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          aria-label={a}
          onClick={() => onChange(a)}
          className={`flex size-11 items-center justify-center rounded-full text-2xl transition ${
            value === a ? "bg-primary/15 ring-2 ring-primary" : "bg-secondary hover:bg-accent"
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}
