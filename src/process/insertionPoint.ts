import { imageToWorld } from "./slotLayout";
import { centroid, geometryFor, START_PENTAGON } from "./tokenGeometry";
import type { PlacedToken, Point, ProcessSlot } from "./processTypes";

const BLUE_CENTER = centroid(START_PENTAGON);

/** The empty pentagon that follows the token just placed. */
export function nextPlaceholder(
  index: number,
  slots: ProcessSlot[],
  phaseInStart: boolean,
): ProcessSlot | null {
  if (index <= 0) return null;
  return slots[index - (phaseInStart ? 1 : 0)] ?? null;
}

/** Slot that feeds the gap. Negative means the gap is the start pentagon's own tip. */
export function chainSlot(index: number, phaseInStart: boolean): number {
  return phaseInStart ? index - 2 : index - 1;
}

/** World point where the next token meets the chain. */
export function seamPoint(
  index: number,
  start: PlacedToken,
  slots: ProcessSlot[],
  phaseInStart: boolean,
): Point {
  if (index <= 0) {
    const anchor = geometryFor(start.token).anchor;
    return imageToWorld(
      BLUE_CENTER,
      anchor,
      { x: start.x, y: start.y },
      start.heading,
      start.scale,
    );
  }
  const slotIndex = chainSlot(index, phaseInStart);
  if (slotIndex < 0) return slots[0].entry;
  return slots[slotIndex].exit;
}

/** Just past the outgoing edge, so the plus reads as the next place to add. */
export function plusPoint(
  index: number,
  start: PlacedToken,
  slots: ProcessSlot[],
  phaseInStart: boolean,
): Point {
  const point = seamPoint(index, start, slots, phaseInStart);
  const slotIndex = chainSlot(index, phaseInStart);
  const slot = slotIndex < 0 ? slots[0] : slots[slotIndex];
  if (!slot) return point;
  const dx = slotIndex < 0 ? slot.x - slot.entry.x : slot.exit.x - slot.x;
  const dy = slotIndex < 0 ? slot.y - slot.entry.y : slot.exit.y - slot.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: point.x + (dx / length) * 28,
    y: point.y + (dy / length) * 28,
  };
}
