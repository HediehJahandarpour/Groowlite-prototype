/**
 * Irregular orbital slots for one recommendation group.
 * Positions are normalised around the centre, then scaled to the viewport.
 * The same group index always returns the same points.
 */

const CLOUD: ReadonlyArray<readonly [number, number]> = [
  [0.94, -0.18],
  [-0.86, -0.42],
  [0.4, 0.9],
  [-0.58, 0.74],
  [0.82, 0.46],
  [-1.02, 0.16],
  [0.16, -0.96],
  [-0.24, -0.8],
  [0.68, -0.68],
  [-0.48, -0.08],
];

/**
 * Irregular halo around the gradient.
 * The band is wide enough that tokens keep different radii, and tight
 * enough that the field stays inside the rings.
 */
const MIN_RADIUS = 0.55;
const MAX_RADIUS = 1;
const MIN_SEPARATION = 0.62;

export type OrbitPoint = {
  x: number;
  y: number;
  tiltX: number;
  tiltY: number;
  presence: number;
};

export type SpatialCandidate = {
  id: string;
  asset: string;
  label: string;
  type: "phase" | "activity" | "checkpoint" | "start" | "end";
  category: "anchor" | "phase" | "activity" | "checkpoint";
  group: number;
  rank: number;
  x: number;
  y: number;
  tiltX: number;
  tiltY: number;
  presence: number;
};

type CandidateSeed = {
  id: string;
  asset: string;
  label: string;
  type: SpatialCandidate["type"];
  category: SpatialCandidate["category"];
};

function clampRadius(x: number, y: number): { x: number; y: number } {
  const distance = Math.hypot(x, y) || 1;
  const limited = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, distance));
  return { x: (x / distance) * limited, y: (y / distance) * limited };
}

function ring(count: number, groupIndex: number): { x: number; y: number }[] {
  const spin = groupIndex * 0.66 - Math.PI / 2;
  return Array.from({ length: count }, (_, index) => {
    const wobble = ((index * 3 + groupIndex) % 5) / 4;
    const angle = spin + (index / count) * Math.PI * 2 + (wobble - 0.5) * 0.28;
    const radius = 0.7 + wobble * 0.1;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

export function orbitPoints(
  count: number,
  groupIndex: number,
  layout: "cloud" | "ring" = "cloud",
): OrbitPoint[] {
  if (layout === "ring") {
    return ring(count, groupIndex).map((point) => ({
      x: point.x,
      y: point.y,
      tiltX: point.y * 5.5,
      tiltY: -point.x * 5.5,
      presence: 1,
    }));
  }

  const turn = groupIndex * 0.66;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const scale = 0.9 + (groupIndex % 3) * 0.03;
  const points = Array.from({ length: count }, (_, index) => {
    const source = CLOUD[(index + groupIndex * 3) % CLOUD.length];
    const scaledX = source[0] * scale;
    const scaledY = source[1] * scale;
    return clampRadius(
      scaledX * cos - scaledY * sin,
      scaledX * sin + scaledY * cos,
    );
  });

  if (groupIndex === 0) {
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (point.y < 0.32 || Math.abs(point.x) > 0.46) continue;
      const side =
        point.x === 0 ? (index % 2 === 0 ? -1 : 1) : Math.sign(point.x);
      points[index] = clampRadius(
        side * Math.max(Math.abs(point.x), 0.64),
        Math.min(point.y, 0.62),
      );
    }
  }

  for (let pass = 0; pass < 12; pass += 1) {
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        const dx = points[right].x - points[left].x;
        const dy = points[right].y - points[left].y;
        const distance = Math.hypot(dx, dy) || 0.0001;
        if (distance >= MIN_SEPARATION) continue;
        const push = (MIN_SEPARATION - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        points[left] = {
          x: points[left].x - ux * push,
          y: points[left].y - uy * push,
        };
        points[right] = {
          x: points[right].x + ux * push,
          y: points[right].y + uy * push,
        };
      }
    }
    for (let index = 0; index < points.length; index += 1) {
      points[index] = clampRadius(points[index].x, points[index].y);
    }
  }

  return points.map((point, index) => ({
    x: point.x,
    y: point.y,
    tiltX: point.y * 5.5,
    tiltY: -point.x * 5.5,
    presence: 0.9 + ((index * 2 + groupIndex) % 4) * 0.04,
  }));
}

/**
 * Place each recommendation layer on its own depth group.
 * A token id is kept once, in the nearest group that contained it.
 */
export function placeCandidates(
  groups: readonly (readonly CandidateSeed[])[],
): SpatialCandidate[] {
  const seen = new Set<string>();
  const placed: SpatialCandidate[] = [];
  groups.forEach((group, groupIndex) => {
    const layout = group.every((item) => item.type === "phase")
      ? "ring"
      : "cloud";
    const points = orbitPoints(group.length, groupIndex, layout);
    group.forEach((item, index) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      const point = points[index];
      if (!point) return;
      placed.push({
        id: item.id,
        asset: item.asset,
        label: item.label,
        type: item.type,
        category: item.category,
        group: groupIndex,
        rank: index,
        x: point.x,
        y: point.y,
        tiltX: point.tiltX,
        tiltY: point.tiltY,
        presence: point.presence,
      });
    });
  });
  return placed;
}
