import type { PlayerCount, RuleConfig } from "./types";

const base = {
  housesPerSide: 5,
  danPerHouse: 5,
  quanPerCorner: 1,
  danValue: 1,
  quanValue: 10,
  feedCount: 5,
  minDanToCaptureQuan: 0,
  maxSowSteps: 500,
} as const;

/** Per-mode defaults. Adjust a mode here without touching the engine. */
const MODE_OVERRIDES: Record<PlayerCount, Partial<RuleConfig>> = {
  2: {},
  3: {},
  4: {},
};

export function defaultConfig(playerCount: PlayerCount): RuleConfig {
  return { ...base, ...MODE_OVERRIDES[playerCount], playerCount };
}
