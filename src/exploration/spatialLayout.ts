/**
 * Even circles for one recommendation group.
 * Positions are normalised around the centre, then scaled to the viewport.
 * The same group index always returns the same points.
 * Depth spread turns one shared circle into the inner and outer layers.
 * The next group is rotated by half a step, so its tokens sit in the gaps.
 */

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

function circle(
  count: number,
  groupIndex: number,
  radius: number,
): { x: number; y: number }[] {
  const safe = Math.max(count, 1);
  const step = (Math.PI * 2) / safe;
  const spin = -Math.PI / 2 + groupIndex * step * 0.5;
  return Array.from({ length: count }, (_, index) => {
    const angle = spin + index * step;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

export function orbitPoints(
  count: number,
  groupIndex: number,
  _layout: "cloud" | "ring" = "ring",
): OrbitPoint[] {
  void _layout;
  const points = circle(count, groupIndex, 1);

  return points.map((point) => ({
    x: point.x,
    y: point.y,
    tiltX: point.y * 5.5,
    tiltY: -point.x * 5.5,
    presence: 1,
  }));
}

/**
 * Place each recommendation layer on its own depth group.
 * A token id is kept once, in the nearest group that contained it.
 * Every ring is an even circle with equal neighbour spacing.
 */
export function placeCandidates(
  groups: readonly (readonly CandidateSeed[])[],
): SpatialCandidate[] {
  const seen = new Set<string>();
  const placed: SpatialCandidate[] = [];
  groups.forEach((group, groupIndex) => {
    const points = orbitPoints(group.length, groupIndex, "ring");
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

/**
 * Re-assert even circle seats for every depth group.
 */
export function evenRingSpacing(
  candidates: SpatialCandidate[],
): SpatialCandidate[] {
  const groups = new Map<number, SpatialCandidate[]>();
  for (const item of candidates) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  const next: SpatialCandidate[] = [];
  const groupIndexes = [...groups.keys()].sort((left, right) => left - right);
  for (const groupIndex of groupIndexes) {
    const items = groups.get(groupIndex)!;
    const ordered = items
      .slice()
      .sort(
        (left, right) =>
          left.rank - right.rank || left.id.localeCompare(right.id),
      );
    const points = orbitPoints(ordered.length, groupIndex, "ring");
    ordered.forEach((item, index) => {
      const point = points[index];
      if (!point) {
        next.push(item);
        return;
      }
      next.push({
        ...item,
        x: point.x,
        y: point.y,
        tiltX: point.tiltX,
        tiltY: point.tiltY,
        presence: point.presence,
      });
    });
  }
  return next;
}
