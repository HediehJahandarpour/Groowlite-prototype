import type { Point } from "./processTypes";

export type StampSeat = {
  x: number;
  y: number;
  /** Clockwise degrees. Stands the piece out from the upper edge. */
  tilt: number;
};

/**
 * Seat a piece on the pentagon's upper straight side.
 * The contact is the middle of that edge, not the corner above it.
 */
export function upperEdgeSeat(points: readonly Point[]): StampSeat {
  const count = points.length;
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  center.x /= count;
  center.y /= count;

  let best: { x: number; y: number; nx: number; ny: number; up: number } | null =
    null;

  for (let index = 0; index < count; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % count];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    let nx = dy / length;
    let ny = -dx / length;
    if ((mid.x - center.x) * nx + (mid.y - center.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const up = -ny;
    const moreUpward = best !== null && up > best.up + 1e-4;
    const equallyUp = best !== null && Math.abs(up - best.up) <= 1e-4;
    const higher = equallyUp && mid.y < best.y - 0.5;
    if (!best || moreUpward || higher) {
      best = { x: mid.x, y: mid.y, nx, ny, up };
    }
  }

  if (!best) return { x: center.x, y: center.y, tilt: 0 };
  const tilt = (Math.atan2(best.nx, -best.ny) * 180) / Math.PI;
  return { x: best.x, y: best.y, tilt };
}
