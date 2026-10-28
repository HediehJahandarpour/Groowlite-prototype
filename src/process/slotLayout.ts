import type { Point, ProcessSlot } from "./processTypes";
import { distance } from "./tokenGeometry";

/**
 * Wave shape knobs.
 *
 * The chain is not a curve with tokens dropped on it. Each slot is a regular
 * pentagon. Slot n+1 is placed by laying its incoming edge exactly on slot n's
 * outgoing edge. `outputEdges` is the repeating choice of which side that
 * outgoing edge is, and that cycle is what makes the path rise and fall.
 *
 * - `radius` — pentagon size, in world pixels. Larger slots push neighbours apart.
 * - `outputEdges` — cycle of local edge indexes (0–4). This is the wave recipe.
 * - `inputEdge` — local edge that receives the previous slot. Keep this matched
 *   to the token outlines in tokenGeometry (vertex 0 is the top point).
 * - `origin` — world position of the starting point's outgoing edge.
 * - `runLength` — how many pentagon slots exist, including hidden future ones.
 */
export const SLOT_LAYOUT = {
  radius: 70,
  inputEdge: 2,
  outputEdges: [4, 4, 0, 0],
  origin: { x: 380, y: 300 },
  /** Where the endpoint rests before any intermediate token is added. */
  endRest: { x: 720, y: 390 },
  runLength: 16,
  futureSlots: 4,
};

export const SLOT_EDGE = 2 * SLOT_LAYOUT.radius * Math.sin(Math.PI / 5);

function rotatePoint(point: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor };
}

function unit(point: Point): Point {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: point.y / length };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Point-up regular pentagon around the origin. Vertex 0 is the top point. */
function localPentagon(rotation: number, radius = SLOT_LAYOUT.radius): Point[] {
  return Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + index * ((2 * Math.PI) / 5) + rotation;
    return {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  });
}

function edgeOf(points: Point[], index: number): {
  normal: Point;
  mid: Point;
  a: Point;
  b: Point;
} {
  const a = points[index];
  const b = points[(index + 1) % points.length];
  const mid = midpoint(a, b);
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  return {
    normal: unit(sub(mid, { x: center.x / points.length, y: center.y / points.length })),
    mid,
    a,
    b,
  };
}

export type WorldEdge = {
  a: Point;
  b: Point;
  normal: Point;
  mid: Point;
};

/**
 * Build the pentagon run so slot 0's incoming edge lies on `entry`.
 * `entry.normal` points out of the previous piece, toward the slot.
 * `radii` lets an activity sit in a smaller pentagon than a phase.
 * A shorter edge stays centered on the previous edge.
 */
export function buildSlots(
  count: number,
  entry: WorldEdge,
  radii?: readonly number[],
  startIndex = 0,
): ProcessSlot[] {
  const radiusAt = (index: number) => {
    const radius = radii?.[index];
    return radius && radius > 0 ? radius : SLOT_LAYOUT.radius;
  };
  const localNormal = edgeOf(localPentagon(0), SLOT_LAYOUT.inputEdge).normal;
  const slots: ProcessSlot[] = [];
  // The slot's incoming normal points back at the previous piece.
  let desired = scale(entry.normal, -1);
  let radius = radiusAt(0);
  let rotation = Math.atan2(desired.y, desired.x) - Math.atan2(localNormal.y, localNormal.x);
  let center = sub(
    entry.mid,
    edgeOf(localPentagon(rotation, radius), SLOT_LAYOUT.inputEdge).mid,
  );

  for (let index = 0; index < count; index += 1) {
    const wave = startIndex + index;
    const polygon = localPentagon(rotation, radius).map((point) => add(point, center));
    const incoming = edgeOf(polygon, SLOT_LAYOUT.inputEdge);
    const outgoing = edgeOf(
      polygon,
      SLOT_LAYOUT.outputEdges[wave % SLOT_LAYOUT.outputEdges.length],
    );
    slots.push({
      index: wave,
      x: center.x,
      y: center.y,
      rotation,
      entry: incoming.mid,
      exit: outgoing.mid,
      entryEdge: [incoming.a, incoming.b],
      exitEdge: [outgoing.a, outgoing.b],
      polygon,
    });

    const nextRadius = radiusAt(index + 1);
    desired = scale(outgoing.normal, -1);
    rotation = Math.atan2(desired.y, desired.x) - Math.atan2(localNormal.y, localNormal.x);
    center = sub(
      outgoing.mid,
      edgeOf(localPentagon(rotation, nextRadius), SLOT_LAYOUT.inputEdge).mid,
    );
    radius = nextRadius;
  }

  return slots;
}

/** Map an image point through a token's placement. */
export function imageToWorld(
  point: Point,
  anchor: Point,
  world: Point,
  heading: number,
  tokenScale: number,
): Point {
  return add(world, rotatePoint(scale(sub(point, anchor), tokenScale), heading));
}

export function edgeLength(a: Point, b: Point): number {
  return distance(a, b);
}

export function slotRunLength(occupied: number): number {
  return Math.max(SLOT_LAYOUT.runLength, occupied + SLOT_LAYOUT.futureSlots);
}
