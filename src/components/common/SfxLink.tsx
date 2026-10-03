"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { sfx } from "@/features/game/sound";

/** A Link that plays the "select" sound when chosen (game modes, difficulty, player count). */
export function SfxLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        sfx.select();
        onClick?.(e);
      }}
    />
  );
}
