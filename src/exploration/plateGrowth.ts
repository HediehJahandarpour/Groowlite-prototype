import { GRADIENT_VIEW, TOKEN_CIRCLES } from "../process/activityGradient";

/**
 * Scroll growth for the explorer rings.
 * Reveal 0 is the opening size. Reveal 1 is the end of the scroll.
 * The pale outer ring starts with the others, then grows more slowly
 * and finishes larger than the inner plate.
 */
export const PLATE_GROWTH = {
  start: 0.72,
  outerEnd: 1.28,
} as const;

/** On-screen radius of the outermost radar ring at the opening size. */
export function plateOuterRadius(width: number, height: number): number {
  const vmin = Math.min(Math.max(width, 1), Math.max(height, 1));
  const plateWidth = Math.min(vmin * 1.42, 1680);
  return (plateWidth / 2) * PLATE_GROWTH.start;
}

/**
 * On-screen radius of a Figma token stroke at the opening plate size.
 * Index 0 is the innermost circle the five phases sit on.
 */
export function plateStrokeRadius(
  width: number,
  height: number,
  strokeIndex = 0,
): number {
  const outer = plateOuterRadius(width, height);
  const stroke = TOKEN_CIRCLES[Math.min(strokeIndex, TOKEN_CIRCLES.length - 1)];
  const rim = GRADIENT_VIEW / 2;
  return outer * (stroke.r / rim);
}

export function plateScale(reveal: number): number {
  const t = Math.min(1, Math.max(0, reveal));
  const eased = 1 - (1 - t) ** 1.2;
  return PLATE_GROWTH.start + (1 - PLATE_GROWTH.start) * eased;
}

export function outerPlateScale(reveal: number): number {
  const t = Math.min(1, Math.max(0, reveal));
  const eased = t ** 2.15;
  return (
    PLATE_GROWTH.start + (PLATE_GROWTH.outerEnd - PLATE_GROWTH.start) * eased
  );
}
