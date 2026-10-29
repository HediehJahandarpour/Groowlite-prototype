/**
 * Scroll growth for the explorer rings.
 * Reveal 0 is the opening size. Reveal 1 is the end of the scroll.
 * The pale outer ring starts with the others, then grows more slowly
 * and finishes larger than the inner plate.
 */
export const PLATE_GROWTH = {
  start: 0.46,
  outerEnd: 1.22,
} as const;

export function plateScale(reveal: number): number {
  const t = Math.min(1, Math.max(0, reveal));
  const eased = 1 - (1 - t) ** 1.2;
  return PLATE_GROWTH.start + (1 - PLATE_GROWTH.start) * eased;
}

export function outerPlateScale(reveal: number): number {
  const t = Math.min(1, Math.max(0, reveal));
  const eased = t ** 2.15;
  return PLATE_GROWTH.start + (PLATE_GROWTH.outerEnd - PLATE_GROWTH.start) * eased;
}
