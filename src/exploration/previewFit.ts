import { artFrame, geometryFor } from "../process/tokenGeometry";
import { imageToWorld } from "../process/slotLayout";
import type { PlacedToken, Point } from "../process/processTypes";

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function boundsOf(points: readonly Point[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(bounds: Bounds[]): Bounds | null {
  return boundsOf(
    bounds.flatMap((box) => [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.maxY },
    ]),
  );
}

/** World rectangle of a placed token's artwork, including rotation. */
export function placedArtBounds(item: PlacedToken): Bounds {
  const geometry = geometryFor(item.token);
  const frame = artFrame(geometry);
  const corners = [
    { x: 0, y: 0 },
    { x: frame.width, y: 0 },
    { x: frame.width, y: frame.height },
    { x: 0, y: frame.height },
  ].map((point) =>
    imageToWorld(
      point,
      geometry.anchor,
      { x: item.x, y: item.y },
      item.heading,
      item.scale,
    ),
  );
  return boundsOf(corners) ?? { minX: item.x, minY: item.y, maxX: item.x, maxY: item.y };
}

/**
 * Fit a world bounding box inside a fixed screen frame.
 * The result does not use the canvas zoom.
 */
export function fitBounds(
  bounds: Bounds,
  frame: { width: number; height: number },
  padding = 0,
): { scale: number; x: number; y: number } {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const innerWidth = Math.max(1, frame.width - padding * 2);
  const innerHeight = Math.max(1, frame.height - padding * 2);
  const scale = Math.min(innerWidth / width, innerHeight / height);
  return {
    scale,
    x: padding + (innerWidth - width * scale) / 2 - bounds.minX * scale,
    y: padding + (innerHeight - height * scale) / 2 - bounds.minY * scale,
  };
}
