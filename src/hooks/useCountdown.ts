"use client";

import { useEffect, useState } from "react";

/**
 * Whole seconds left until `deadline` (ms epoch), refreshed while `active`.
 * Returns null when inactive. Capped at `max` so a stale clock reading can't flash a bigger number.
 */
export function useCountdown(deadline: number | null, active: boolean, max: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [active, deadline]);
  if (!active || deadline === null) return null;
  return Math.min(max, Math.max(0, Math.ceil((deadline - now) / 1000)));
}
