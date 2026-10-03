import type { RuleConfig } from "./engine";

export interface Point {
  x: number;
  y: number;
}

export interface BoardGeometry {
  /** Cell centres in a 0..100 box (x) by 0..(100/aspect) box (y), as percentages of each axis. */
  positions: Point[];
  /** width / height of the board container. */
  aspect: number;
  /** House diameter as a % of board width. */
  houseSize: number;
  /** Quan cell diameter as a % of board width. */
  quanSize: number;
  /** Visual centre of the board (for the turn indicator). */
  center: Point;
}

/**
 * Lay the ring out on the screen. Cell index order follows the engine ring:
 * seat 0 sits on the bottom side and play runs counter-clockwise on screen.
 *  - 2 players: wide rectangle, quan cells at the left/right ends.
 *  - 3 players: triangle, quan cells at the vertices.
 *  - 4 players: square, quan cells at the corners.
 */
export function boardGeometry(config: RuleConfig): BoardGeometry {
  const n = config.playerCount;
  const h = config.housesPerSide;
  const stride = h + 1;
  const positions: Point[] = [];

  if (n === 2) {
    const aspect = 1.75;
    const left = 9;
    const right = 91;
    const span = (right - left) / stride;
    // y is a percentage of height
    positions[0] = { x: left, y: 50 };
    for (let k = 1; k <= h; k++) positions[k] = { x: left + span * k, y: 78 };
    positions[stride] = { x: right, y: 50 };
    for (let k = 1; k <= h; k++) positions[stride + k] = { x: right - span * k, y: 22 };
    return { positions, aspect, houseSize: span * 0.86, quanSize: 14, center: { x: 50, y: 50 } };
  }

  // Regular polygon with vertex 0 at the bottom-left, going counter-clockwise on screen.
  const start = Math.PI / 2 + Math.PI / n; // bottom-left for square/triangle bases
  const radius = n === 3 ? 50 : 60;
  const cx = 50;
  // Triangle: shift down so the shape (top = cy-R, bottom = cy+R/2) is vertically centred.
  const cy = n === 3 ? 50 + radius / 4 : 50;
  const vertex = (i: number): Point => {
    const a = start - (i * 2 * Math.PI) / n;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  for (let seat = 0; seat < n; seat++) {
    const a = vertex(seat);
    const b = vertex(seat + 1);
    positions[seat * stride] = a;
    for (let k = 1; k <= h; k++) {
      const t = k / stride;
      positions[seat * stride + k] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  const side = Math.hypot(vertex(1).x - vertex(0).x, vertex(1).y - vertex(0).y);
  const span = side / stride;
  return { positions, aspect: 1, houseSize: span * 0.88, quanSize: span * 1.15, center: { x: cx, y: cy } };
}
