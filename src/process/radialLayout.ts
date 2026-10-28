import type { CanvasView } from "../canvas/view";
import { TOKEN_CATALOG, type CatalogEntry } from "./tokenCatalog";
import type { Point } from "./processTypes";

/**
 * Phase radial selector, in world pixels.
 * The canvas camera is the only scale. Zoom in and out with the other tokens.
 *
 * gradient — width of phase-gradient.svg
 * orbit — distance from the phase token to the half-circle the others sit on
 * token — width of each surrounding phase token
 * endpointClearance — how far the endpoint slides right while the library is open
 */

/** phase-gradient.svg. The innermost ring is left of the viewBox center. */
const GRADIENT_VIEW = 706;
const INNER_CIRCLE = { x: 246.97, y: 344.62 };
const OUTER_CIRCLE = { x: 352.658, y: 352.658, r: 277 };
/** Innermost ring radius. The half circle uses it so tokens stay on the plate. */
const INNER_RING = 169;

const GRADIENT_SIZE = 580;
const gradientScale = GRADIENT_SIZE / GRADIENT_VIEW;

export const RADIAL = {
  gradient: GRADIENT_SIZE,
  /** Token centers sit on the inner ring, so the arc stays inside the plate. */
  orbit: Math.round(INNER_RING * gradientScale),
  /** Narrow enough that a token on that ring does not spill past the next ring. */
  token: 104,
  endpointClearance: 460,
};

/** The rings sit a little to the right of the phase token, as in the frame. */
const GRADIENT_NUDGE = { x: 56, y: 8 };

/** Half circle on the open side: top, through the right, to the bottom. Degrees, clockwise from the right. */
const ARC_START = -90;
const ARC_END = 90;

const SAFE = { top: 16, right: 24, bottom: 80, left: 88 };

export type RadialToken = {
  entry: CatalogEntry;
  angle: number;
  x: number;
  y: number;
};

export type WorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type RadialLayout = {
  gradient: number;
  token: number;
  category: number;
  center: Point;
  tokens: RadialToken[];
  /** Selector artwork, used to fit the circle to the viewport. */
  bounds: WorldBounds;
  /** Selector plus the process token just to its left, used to pan into view. */
  reveal: WorldBounds;
};

export function phaseRadialEntries(): Array<{
  entry: CatalogEntry;
  angle: number;
}> {
  const items = TOKEN_CATALOG.phase;
  return items.map((entry, index) => {
    const t = items.length === 1 ? 0.5 : index / (items.length - 1);
    return { entry, angle: ARC_START + (ARC_END - ARC_START) * t };
  });
}

export function layoutRadial(
  origin: Point,
  entries: Array<{ entry: CatalogEntry; angle: number }>,
): RadialLayout {
  return measure(origin, entries);
}

/** Keep a world rectangle inside the canvas. Applying it twice changes nothing. */
export function fitCamera(
  view: CanvasView,
  bounds: WorldBounds,
  width: number,
  height: number,
): CanvasView {
  let x = view.x;
  let y = view.y;
  const left = () => bounds.minX * view.scale + x;
  const right = () => bounds.maxX * view.scale + x;
  const top = () => bounds.minY * view.scale + y;
  const bottom = () => bounds.maxY * view.scale + y;

  if (right() > width - SAFE.right) x -= right() - (width - SAFE.right);
  if (left() < SAFE.left) x += SAFE.left - left();
  if (bottom() > height - SAFE.bottom) y -= bottom() - (height - SAFE.bottom);
  if (top() < SAFE.top) y += SAFE.top - top();

  if (x === view.x && y === view.y) return view;
  return { ...view, x, y };
}

function measure(
  origin: Point,
  entries: Array<{ entry: CatalogEntry; angle: number }>,
): RadialLayout {
  const gradient = RADIAL.gradient;
  const token = RADIAL.token;
  const category = token;
  const scale = gradient / GRADIENT_VIEW;
  // Innermost ring on the phase token, then nudge the whole plate right.
  const center = {
    x:
      origin.x -
      (INNER_CIRCLE.x - GRADIENT_VIEW / 2) * scale +
      GRADIENT_NUDGE.x,
    y:
      origin.y -
      (INNER_CIRCLE.y - GRADIENT_VIEW / 2) * scale +
      GRADIENT_NUDGE.y,
  };
  const orbit = RADIAL.orbit;
  const ring = {
    x: origin.x + GRADIENT_NUDGE.x,
    y: origin.y + GRADIENT_NUDGE.y,
  };
  const tokens = entries.map((item) => {
    const rad = (item.angle * Math.PI) / 180;
    return {
      entry: item.entry,
      angle: item.angle,
      x: ring.x + Math.cos(rad) * orbit,
      y: ring.y + Math.sin(rad) * orbit,
    };
  });

  let minX = origin.x - category / 2;
  let maxX = origin.x + category / 2;
  let minY = origin.y - category / 2;
  let maxY = origin.y + category / 2;
  const grow = (x: number, y: number, pad: number) => {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minY = Math.min(minY, y - pad);
    maxY = Math.max(maxY, y + pad);
  };
  const outer = {
    x: origin.x + (OUTER_CIRCLE.x - INNER_CIRCLE.x) * scale + GRADIENT_NUDGE.x,
    y: origin.y + (OUTER_CIRCLE.y - INNER_CIRCLE.y) * scale + GRADIENT_NUDGE.y,
  };
  grow(outer.x, outer.y, OUTER_CIRCLE.r * scale);
  for (const item of tokens) grow(item.x, item.y, token / 2);

  const bounds = { minX, minY, maxX, maxY };
  return {
    gradient,
    token,
    category,
    center,
    tokens,
    bounds,
    reveal: { ...bounds, minX: minX - 160 },
  };
}
