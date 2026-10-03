import { describe, expect, it } from "vitest";
import { createGame } from "@/features/game/engine";
import { boardGeometry } from "@/features/game/geometry";

describe("board geometry", () => {
  it.each([2, 3, 4] as const)("%i players: one position per cell, inside the board, no overlaps", (p) => {
    const { config } = createGame(p);
    const g = boardGeometry(config);
    expect(g.positions).toHaveLength(p * 6);
    for (const pt of g.positions) {
      expect(pt.x).toBeGreaterThan(0);
      expect(pt.x).toBeLessThan(100);
      expect(pt.y).toBeGreaterThan(0);
      expect(pt.y).toBeLessThan(100);
    }
    // adjacent cells (in % of width) must be at least a house diameter apart
    for (let i = 0; i < g.positions.length; i++) {
      const a = g.positions[i];
      const b = g.positions[(i + 1) % g.positions.length];
      const d = Math.hypot(a.x - b.x, (a.y - b.y) / g.aspect);
      expect(d).toBeGreaterThan(g.houseSize * 0.8);
    }
  });
});
