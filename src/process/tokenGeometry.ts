import { ACTIVITY_ASSETS } from "../data/activityRegistry";
import type { Point, ProcessToken, TokenGeometry } from "./processTypes";

/** Image pixels to canvas world pixels. Shared so every joint stays in scale. */
export const TOKEN_SCALE = 0.36;

/**
 * Phase and activity artwork points upward. A clockwise quarter-turn
 * sends that point along the path.
 */
const POINT_FORWARD = 90;

/** Point-up phase pentagon. The flat base is the incoming edge; the tip leads. */
const PHASE_OUTLINE: Point[] = [
  { x: 201, y: 3 },
  { x: 386, y: 137 },
  { x: 316, y: 354 },
  { x: 86, y: 354 },
  { x: 16, y: 137 },
];

/** Smaller point-up activity pentagon. */
const ACTIVITY_OUTLINE: Point[] = [
  { x: 156, y: 8 },
  { x: 298, y: 110 },
  { x: 245, y: 276 },
  { x: 68, y: 276 },
  { x: 15, y: 110 },
];

const PHASE_INPUT_WIDTH = 230;
const ACTIVITY_INPUT_WIDTH = 177;

/**
 * Activity pentagons use the same artwork scale as a phase, so they stay
 * smaller. The phase edge is the size of the pentagon in the starting point.
 */
export const ACTIVITY_TO_PHASE = ACTIVITY_INPUT_WIDTH / PHASE_INPUT_WIDTH;

/**
 * Checkpoint trapezoid, turned so the chain meets its left and right sides.
 * Edge 2 is the left side (previous token). The right side leads to the next.
 */
const CHECKPOINT_LEFT: readonly [Point, Point] = [
  { x: 30, y: 277 },
  { x: 97, y: 35 },
];
const CHECKPOINT_RIGHT: readonly [Point, Point] = [
  { x: 161, y: 35 },
  { x: 228, y: 277 },
];
const CHECKPOINT_INPUT_WIDTH = Math.hypot(
  CHECKPOINT_LEFT[1].x - CHECKPOINT_LEFT[0].x,
  CHECKPOINT_LEFT[1].y - CHECKPOINT_LEFT[0].y,
);
const CHECKPOINT_OUTLINE: Point[] = [
  CHECKPOINT_RIGHT[0],
  CHECKPOINT_RIGHT[1],
  CHECKPOINT_LEFT[0],
  CHECKPOINT_LEFT[1],
  { x: 129, y: 35 },
];

/** Blue pentagon in the starting-point notch. Its tip is the outgoing joint. */
export const START_PENTAGON: Point[] = [
  { x: 683, y: 226 },
  { x: 549, y: 410 },
  { x: 332, y: 340 },
  { x: 332, y: 112 },
  { x: 549, y: 41 },
];

const phase = (width: number, height: number): TokenGeometry => ({
  width,
  height,
  anchor: { x: 201, y: 354 },
  output: { x: 201, y: 3 },
  artRotation: POINT_FORWARD,
  outline: PHASE_OUTLINE,
  inputWidth: PHASE_INPUT_WIDTH,
});

const activity = (width: number, height: number): TokenGeometry => ({
  width,
  height,
  anchor: { x: 156.5, y: 276 },
  output: { x: 156, y: 8 },
  artRotation: POINT_FORWARD,
  outline: ACTIVITY_OUTLINE,
  inputWidth: ACTIVITY_INPUT_WIDTH,
});

const checkpoint = (): TokenGeometry => ({
  width: 259,
  height: 313,
  anchor: {
    x: (CHECKPOINT_LEFT[0].x + CHECKPOINT_LEFT[1].x) / 2,
    y: (CHECKPOINT_LEFT[0].y + CHECKPOINT_LEFT[1].y) / 2,
  },
  output: {
    x: (CHECKPOINT_RIGHT[0].x + CHECKPOINT_RIGHT[1].x) / 2,
    y: (CHECKPOINT_RIGHT[0].y + CHECKPOINT_RIGHT[1].y) / 2,
  },
  artRotation: 0,
  outline: CHECKPOINT_OUTLINE,
  inputWidth: CHECKPOINT_INPUT_WIDTH,
});

const GEOMETRY: Record<string, TokenGeometry> = {
  "vertrekpunt@2x.png": {
    width: 575,
    height: 453,
    anchor: { x: 616, y: 318 },
    output: null,
    artRotation: 0,
    pentagon: START_PENTAGON,
    outline: START_PENTAGON,
  },
  "eindpunt@2x.png": {
    width: 523,
    height: 454,
    anchor: { x: 194, y: 226 },
    output: null,
    artRotation: 0,
  },
  "begrijpen@2x.png": phase(403, 387),
  "ontdekken@2x.png": phase(404, 387),
  "ontwerpen@2x.png": phase(404, 387),
  "maken@2x.png": phase(404, 387),
  "delen@2x.png": phase(403, 387),
  "blanco@2x.png": activity(313, 313),
  "brainstorm@2x.png": activity(313, 313),
  "planning@2x.png": activity(313, 313),
  "reflecteren@2x.png": activity(312, 313),
  "onderzoeken@2x.png": activity(313, 313),
  "checkpunt@2x.png": checkpoint(),
};

for (const asset of ACTIVITY_ASSETS) {
  if (!GEOMETRY[asset]) GEOMETRY[asset] = activity(313, 313);
}

export function geometryFor(token: ProcessToken): TokenGeometry {
  const geometry = GEOMETRY[token.asset];
  if (!geometry) {
    throw new Error(`No geometry for token asset ${token.asset}`);
  }
  return geometry;
}

export function artFrame(geometry: TokenGeometry): { width: number; height: number } {
  const points = geometry.pentagon ?? [];
  const width = Math.max(geometry.width, ...points.map((point) => point.x));
  const height = Math.max(geometry.height, ...points.map((point) => point.y));
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

export function polygonPoints(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/** Lower forward edge of the blue starting pentagon. The first slot meets this edge. */
export const START_EXIT_EDGE: readonly [Point, Point] = [START_PENTAGON[0], START_PENTAGON[1]];

/** Notch wall of the endpoint. Midpoint is the endpoint anchor. */
export const END_ENTRY_EDGE: readonly [Point, Point] = [
  { x: 194, y: 138.5 },
  { x: 194, y: 313.5 },
];

/** Points out of the endpoint, toward the token that arrives in the notch. */
export const END_ENTRY_NORMAL: Point = { x: -1, y: 0 };

/**
 * Extra clockwise degrees that bring a token's printed label to the bottom
 * edge. The artwork turns in 72° steps, so the pentagon still fills the slot.
 */
export function downwardLabelSpin(headingRadians: number): number {
  const degrees = (headingRadians * 180) / Math.PI;
  const steps = Math.round(-degrees / 72);
  return (((steps % 5) + 5) % 5) * 72;
}

export function centroid(points: readonly Point[]): Point {
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: total.x / points.length, y: total.y / points.length };
}

/** Outward unit normal of a polygon edge, pointing away from the shape. */
export function edgeOutward(points: readonly Point[], index: number): Point {
  const start = points[index];
  const end = points[(index + 1) % points.length];
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const center = centroid(points);
  const dx = middle.x - center.x;
  const dy = middle.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
