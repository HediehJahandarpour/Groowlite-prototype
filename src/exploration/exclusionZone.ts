import { depthOf, poseAtDepth, IMMERSIVE_DEPTH } from "./depthPose";
import { EXPLORATION } from "./explorationConfig";
import type { ScreenRect } from "./cameraFocus";
import type { SpatialCandidate } from "./spatialLayout";

export type PlacementFrame = {
  anchorX: number;
  anchorY: number;
  reachX: number;
  reachY: number;
  tokenSize: number;
  /** Viewport size — used so the outer ring stays on-screen. */
  width?: number;
  height?: number;
  /** Deepest visible ring index; that ring stays off the top/bottom edges. */
  outermostGroup?: number;
};

/**
 * Depth of the resting primary group, where a token is fully visible
 * at the process-token size.
 */
export function foregroundDepth(): number {
  return 0;
}

function projectFactor(z: number): number {
  const denominator = IMMERSIVE_DEPTH.perspective - z;
  if (denominator === 0) return 1;
  return IMMERSIVE_DEPTH.perspective / denominator;
}

export function candidateScreenRect(
  item: { x: number; y: number; presence: number; group: number },
  progress: number,
  frame: PlacementFrame,
): ScreenRect {
  const pose = poseAtDepth(depthOf(item.group, progress));
  const project = projectFactor(pose.z);
  const half = (frame.tokenSize * item.presence * pose.scale * project) / 2;
  const x = frame.anchorX + item.x * frame.reachX * pose.spread * project;
  const y = frame.anchorY + item.y * frame.reachY * pose.spread * project;
  return {
    left: x - half,
    top: y - half,
    right: x + half,
    bottom: y + half,
  };
}

function separated(rect: ScreenRect, zone: ScreenRect): boolean {
  return (
    rect.right <= zone.left ||
    rect.left >= zone.right ||
    rect.bottom <= zone.top ||
    rect.top >= zone.bottom
  );
}

export type ZoneInput = ScreenRect | readonly ScreenRect[] | null;

function listZones(zone: ZoneInput): ScreenRect[] {
  if (!zone) return [];
  if ("left" in zone) return [zone];
  return [...zone];
}

function guardZone(zone: ScreenRect, buffer: number): ScreenRect {
  return {
    left: zone.left - buffer,
    top: zone.top - buffer,
    right: zone.right + buffer,
    bottom: zone.bottom + buffer,
  };
}

const PAIR_GAP = 16;
/** Pentagons leave the corners of their box empty, so packing can sit closer. */
const PAIR_FILL = 0.78;
/**
 * Placement pad against the process. Tight enough that tokens can still
 * sit above and below a left/right corridor instead of fleeing to one side.
 */
const PLACE_PAD = 20;
/** Outermost tokens stay this far inside the viewport top/bottom. */
const OUTER_EDGE_INSET = 108;
/** Ring radius may grow closer to the edge; placement keeps tokens off the poles. */
const FIT_EDGE_INSET = 48;

type MutableAnchor = {
  x: number;
  y: number;
  presence: number;
  group: number;
  /** Normalised radius this token must stay on. */
  radius: number;
};

function fieldOf(depth: number, frame: PlacementFrame) {
  const pose = poseAtDepth(depth);
  const project = projectFactor(pose.z);
  const spanX = frame.reachX * pose.spread * project || 1;
  const spanY = frame.reachY * pose.spread * project || 1;
  return { spanX, spanY, pose };
}

function screenPoint(
  x: number,
  y: number,
  depth: number,
  presence: number,
  frame: PlacementFrame,
) {
  const field = fieldOf(depth, frame);
  const project = projectFactor(field.pose.z);
  return {
    x: frame.anchorX + x * field.spanX,
    y: frame.anchorY + y * field.spanY,
    half: (frame.tokenSize * presence * field.pose.scale * project) / 2,
    spanX: field.spanX,
    spanY: field.spanY,
  };
}

function fromScreen(
  x: number,
  y: number,
  spanX: number,
  spanY: number,
  frame: PlacementFrame,
) {
  return {
    x: (x - frame.anchorX) / spanX,
    y: (y - frame.anchorY) / spanY,
  };
}

/** Keep token bodies outside the controls that sit on the gradient centre. */
function clearHub(
  x: number,
  y: number,
  depth: number,
  presence: number,
  frame: PlacementFrame,
): { x: number; y: number } {
  const screen = screenPoint(x, y, depth, presence, frame);
  const dx = screen.x - frame.anchorX;
  const dy = screen.y - frame.anchorY;
  const distance = Math.hypot(dx, dy) || 0.001;
  const need = EXPLORATION.hubClearance + screen.half;
  if (distance >= need) return { x, y };
  const scale = need / distance;
  return fromScreen(
    frame.anchorX + dx * scale,
    frame.anchorY + dy * scale,
    screen.spanX,
    screen.spanY,
    frame,
  );
}

/** Minimum move that places the footprint fully outside a guarded zone. */
function exitZone(
  x: number,
  y: number,
  depth: number,
  presence: number,
  frame: PlacementFrame,
  zone: ScreenRect,
): { x: number; y: number } {
  const screen = screenPoint(x, y, depth, presence, frame);
  const rect = {
    left: screen.x - screen.half,
    top: screen.y - screen.half,
    right: screen.x + screen.half,
    bottom: screen.y + screen.half,
  };
  if (separated(rect, zone)) return { x, y };
  const pad = 2;
  const options = [
    {
      x: screen.x - (rect.right - zone.left + pad),
      y: screen.y,
      cost: rect.right - zone.left,
    },
    {
      x: screen.x + (zone.right - rect.left + pad),
      y: screen.y,
      cost: zone.right - rect.left,
    },
    {
      x: screen.x,
      y: screen.y - (rect.bottom - zone.top + pad),
      cost: rect.bottom - zone.top,
    },
    {
      x: screen.x,
      y: screen.y + (zone.bottom - rect.top + pad),
      cost: zone.bottom - rect.top,
    },
  ];
  options.sort((a, b) => a.cost - b.cost || a.x - b.x || a.y - b.y);
  return fromScreen(options[0].x, options[0].y, screen.spanX, screen.spanY, frame);
}

function anchorAngle(anchor: MutableAnchor) {
  return Math.atan2(anchor.y, anchor.x);
}

function writeAngle(anchor: MutableAnchor, angle: number) {
  anchor.x = Math.cos(angle) * anchor.radius;
  anchor.y = Math.sin(angle) * anchor.radius;
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Outermost-ring angles that would park a token off the top or bottom edge. */
function angleOffscreen(
  anchor: MutableAnchor,
  angle: number,
  frame: PlacementFrame,
) {
  const rim = frame.outermostGroup ?? 2;
  if (rim < 1 || anchor.group !== rim) return false;
  if (!frame.width || !frame.height) return false;
  const x = Math.cos(angle) * anchor.radius;
  const y = Math.sin(angle) * anchor.radius;
  const screen = screenPoint(
    x,
    y,
    Math.min(anchor.group, 2),
    anchor.presence,
    frame,
  );
  return (
    screen.y - screen.half < OUTER_EDGE_INSET ||
    screen.y + screen.half > frame.height - OUTER_EDGE_INSET
  );
}

/** True when this angle on the token's own circle hits the hub or a process segment. */
function angleBlocked(
  anchor: MutableAnchor,
  angle: number,
  frame: PlacementFrame,
  zones: ScreenRect[],
  /** When true, only the resting ring is tested (placement). */
  restingOnly = false,
) {
  if (angleOffscreen(anchor, angle, frame)) return true;
  const x = Math.cos(angle) * anchor.radius;
  const y = Math.sin(angle) * anchor.radius;
  // Resting ring, plus the next inward ring after one scroll promote —
  // unless placement asked for the parked pose only.
  const resting = Math.min(Math.max(anchor.group, 0), 2);
  const depths =
    restingOnly || resting === 0 ? [resting] : [resting, resting - 1];
  for (const depth of depths) {
    const hub = clearHub(x, y, depth, anchor.presence, frame);
    if (hub.x !== x || hub.y !== y) return true;
    for (const region of zones) {
      const next = exitZone(x, y, depth, anchor.presence, frame, region);
      if (next.x !== x || next.y !== y) return true;
    }
  }
  return false;
}

/**
 * Nearest angle on the same circle that clears the process and hub.
 * Inner rings prefer clearing a horizontal corridor by moving up/down.
 * The outer ring prefers the sides so tokens stay on-screen.
 */
function freeAngle(
  anchor: MutableAnchor,
  frame: PlacementFrame,
  zones: ScreenRect[],
) {
  const base = anchorAngle(anchor);
  if (!angleBlocked(anchor, base, frame, zones, true)) return base;
  const step = Math.PI / 48;
  const rim = frame.outermostGroup ?? 2;
  const score = (angle: number) =>
    anchor.group === rim
      ? Math.abs(Math.cos(angle))
      : Math.abs(Math.sin(angle)) - Math.abs(Math.cos(angle)) * 0.15;
  for (let index = 1; index <= 48; index += 1) {
    const clockwise = base - index * step;
    const counter = base + index * step;
    const clockwiseFree = !angleBlocked(
      anchor,
      clockwise,
      frame,
      zones,
      true,
    );
    const counterFree = !angleBlocked(anchor, counter, frame, zones, true);
    if (clockwiseFree && counterFree) {
      return score(clockwise) >= score(counter) ? clockwise : counter;
    }
    if (clockwiseFree) return clockwise;
    if (counterFree) return counter;
  }
  return base;
}

type FreeArc = { start: number; length: number };

/** Free angular spans on one ring (process + outer edge rules applied). */
function freeArcs(
  probe: MutableAnchor,
  frame: PlacementFrame,
  zones: ScreenRect[],
  samples = 96,
): FreeArc[] {
  const step = (Math.PI * 2) / samples;
  const free = Array.from(
    { length: samples },
    (_, index) =>
      !angleBlocked(probe, -Math.PI + index * step, frame, zones, true),
  );
  if (!free.some(Boolean)) return [];
  let start = 0;
  while (start < samples && free[start]) start += 1;
  if (start === samples) {
    return [{ start: -Math.PI, length: Math.PI * 2 }];
  }
  const arcs: FreeArc[] = [];
  let index = start;
  for (let seen = 0; seen < samples; ) {
    while (seen < samples && !free[index % samples]) {
      index += 1;
      seen += 1;
    }
    if (seen >= samples) break;
    const arcStart = index;
    let length = 0;
    while (seen < samples && free[index % samples]) {
      length += 1;
      index += 1;
      seen += 1;
    }
    arcs.push({
      start: -Math.PI + (arcStart % samples) * step,
      length: length * step,
    });
  }
  return arcs;
}

/** Spread tokens evenly along free arcs so neighbours keep a gap. */
function placeOnFreeArcs(
  count: number,
  arcs: FreeArc[],
  radius: number,
): { x: number; y: number }[] {
  const total = arcs.reduce((sum, arc) => sum + arc.length, 0);
  if (count <= 0 || total <= 0) return [];
  const gap = total / count;
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    let cursor = gap * (index + 0.5);
    let angle = arcs[0].start;
    for (const arc of arcs) {
      if (cursor <= arc.length) {
        angle = arc.start + cursor;
        break;
      }
      cursor -= arc.length;
      angle = arc.start + arc.length;
    }
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    points.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return points;
}

function circlesOverlap(
  left: MutableAnchor,
  leftDepth: number,
  right: MutableAnchor,
  rightDepth: number,
  frame: PlacementFrame,
) {
  const a = screenPoint(left.x, left.y, leftDepth, left.presence, frame);
  const b = screenPoint(right.x, right.y, rightDepth, right.presence, frame);
  const need = (a.half + b.half) * PAIR_FILL + PAIR_GAP;
  return Math.hypot(b.x - a.x, b.y - a.y) < need;
}

/**
 * Slide two tokens apart along their circles. Radius stays fixed, so a
 * layer remains a ring.
 */
function separateOnCircles(
  anchors: MutableAnchor[],
  frame: PlacementFrame,
  zones: ScreenRect[],
) {
  let moved = false;
  for (let left = 0; left < anchors.length; left += 1) {
    for (let right = left + 1; right < anchors.length; right += 1) {
      const a = anchors[left];
      const b = anchors[right];
      const same = a.group === b.group;
      const adjacent = Math.abs(a.group - b.group) === 1;
      if (!same && !adjacent) continue;
      // Keep even ring angles. Only slide when footprints actually overlap.
      const hit = same
        ? circlesOverlap(a, Math.min(a.group, 2), b, Math.min(b.group, 2), frame)
        : circlesOverlap(
            a.group < b.group ? a : b,
            Math.min(Math.min(a.group, b.group), 2),
            a.group < b.group ? b : a,
            Math.min(Math.max(a.group, b.group), 2),
            frame,
          );
      if (!hit) continue;
      const aAngle = anchorAngle(a);
      const bAngle = anchorAngle(b);
      const delta = angleDelta(aAngle, bAngle);
      const sign = delta >= 0 ? 1 : -1;
      const shift = 0.1;
      const nextA = aAngle - sign * shift;
      const nextB = bAngle + sign * shift;
      if (!angleBlocked(a, nextA, frame, zones, true)) {
        writeAngle(a, nextA);
        moved = true;
      }
      if (!angleBlocked(b, nextB, frame, zones, true)) {
        writeAngle(b, nextB);
        moved = true;
      }
    }
  }
  return moved;
}

/**
 * Park resting anchors clear of every process segment (left, right, or both).
 * Each ring keeps its radius and is re-spaced evenly on the free arcs so
 * tokens do not squeeze. The outer ring also stays off the top and bottom
 * edges of the screen. Scroll does not call this. The same inputs always
 * return the same anchors.
 */
export function avoidProcessZone(
  candidates: SpatialCandidate[],
  zone: ZoneInput,
  frame: PlacementFrame,
): SpatialCandidate[] {
  const zones = listZones(zone);
  // Still run when there is no process — the outer ring needs edge safety.
  const guarded = zones.map((item) => guardZone(item, PLACE_PAD));
  const groups = new Map<number, number[]>();
  candidates.forEach((item, index) => {
    const list = groups.get(item.group) ?? [];
    list.push(index);
    groups.set(item.group, list);
  });

  const next = candidates.map((item) => ({ ...item }));
  for (const indices of groups.values()) {
    const ordered = indices
      .slice()
      .sort(
        (left, right) =>
          Math.atan2(candidates[left].y, candidates[left].x) -
          Math.atan2(candidates[right].y, candidates[right].x),
      );
    const sample = candidates[ordered[0]];
    const radius = Math.hypot(sample.x, sample.y) || 1;
    const probe: MutableAnchor = {
      x: sample.x,
      y: sample.y,
      presence: sample.presence,
      group: sample.group,
      radius,
    };
    const arcs = freeArcs(probe, frame, guarded);
    if (arcs.length === 0) {
      for (const index of ordered) {
        const item = next[index];
        const anchor: MutableAnchor = {
          x: item.x,
          y: item.y,
          presence: item.presence,
          group: item.group,
          radius: Math.hypot(item.x, item.y) || 1,
        };
        const angle = freeAngle(anchor, frame, guarded);
        writeAngle(anchor, angle);
        next[index] = {
          ...item,
          x: anchor.x,
          y: anchor.y,
          tiltX: anchor.y * 5.5,
          tiltY: -anchor.x * 5.5,
        };
      }
      continue;
    }
    const points = placeOnFreeArcs(ordered.length, arcs, radius);
    ordered.forEach((index, pointIndex) => {
      const point = points[pointIndex];
      if (!point) return;
      const item = next[index];
      next[index] = {
        ...item,
        x: point.x,
        y: point.y,
        tiltX: point.y * 5.5,
        tiltY: -point.x * 5.5,
      };
    });
  }

  const anchors: MutableAnchor[] = next.map((item) => ({
    x: item.x,
    y: item.y,
    presence: item.presence,
    group: item.group,
    radius: Math.hypot(item.x, item.y) || 1,
  }));
  for (let pass = 0; pass < 16; pass += 1) {
    if (!separateOnCircles(anchors, frame, guarded)) break;
  }
  return next.map((item, index) => {
    const anchor = anchors[index];
    if (anchor.x === item.x && anchor.y === item.y) return item;
    return {
      ...item,
      x: anchor.x,
      y: anchor.y,
      tiltX: anchor.y * 5.5,
      tiltY: -anchor.x * 5.5,
    };
  });
}

function gapFade(rect: ScreenRect, zone: ScreenRect, buffer: number): number {
  const gapX = Math.max(zone.left - rect.right, rect.left - zone.right);
  const gapY = Math.max(zone.top - rect.bottom, rect.top - zone.bottom);
  let gap: number;
  if (gapX > 0 && gapY > 0) gap = Math.hypot(gapX, gapY);
  else if (gapX > 0) gap = gapX;
  else if (gapY > 0) gap = gapY;
  else gap = Math.max(gapX, gapY);
  if (gap >= buffer) return 1;
  if (gap <= 0) return 0;
  return gap / buffer;
}

/**
 * 1 when the token is clear of every process segment, 0 once it touches one.
 * Used while scrolling so a foreground token fades before it covers the chain.
 */
export function foregroundFade(
  item: { x: number; y: number; presence: number; group: number },
  progress: number,
  frame: PlacementFrame,
  zone: ZoneInput,
  buffer = EXPLORATION.fadeBuffer,
): number {
  const zones = listZones(zone);
  if (zones.length === 0 || buffer <= 0) return 1;
  const rect = candidateScreenRect(item, progress, frame);
  let fade = 1;
  for (const region of zones) {
    fade = Math.min(fade, gapFade(rect, region, buffer));
  }
  return fade;
}

export type CircleFit = {
  reach: number;
  tokenSize: number;
};

type CirclePoint = {
  x: number;
  y: number;
  presence: number;
  group: number;
};

/**
 * Largest even activity circle that stays clear of the process.
 * Token size drops only as far as the ring needs in order to keep
 * every token on its assigned angle.
 */
export function fitActivityCircle(input: {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  zones: readonly ScreenRect[];
  fullToken: number;
  fallbackReach: number;
  points: readonly CirclePoint[];
  /** Preferred outer-ring radius, usually the outermost radar ring. */
  targetOuterRadius?: number;
}): CircleFit {
  const unchanged = {
    reach: input.fallbackReach,
    tokenSize: input.fullToken,
  };
  if (input.points.length === 0 || input.width < 2 || input.height < 2) {
    return unchanged;
  }

  // Size rings to the radar / viewport. Process avoidance is visual fade only,
  // so the circles can use the open field instead of staying clustered.
  const clearance = circleClearance(
    input.anchorX,
    input.anchorY,
    input.width,
    input.height,
    [],
  );
  const radar = input.targetOuterRadius ?? clearance;
  const maxGroup = input.points.reduce(
    (max, point) => Math.max(max, point.group),
    0,
  );
  const rimPose = poseAtDepth(Math.min(Math.max(maxGroup, 0), 2));
  const rimProject = projectFactor(rimPose.z);
  const rimPerReach = rimPose.spread * rimProject || 1;
  // Keep the outermost stroke inside the viewport even at the sides.
  const verticalRoom = Math.min(
    input.anchorY - FIT_EDGE_INSET,
    input.height - input.anchorY - FIT_EDGE_INSET,
  );
  const goal = Math.max(140, Math.min(radar, verticalRoom * 0.95));

  // Prefer 130 → 100 → 90. Edge/pole clearance is handled later by
  // avoidProcessZone — do not shrink tokens just to pass polar fits.
  const minSize = Math.min(96, input.fullToken);
  const innerPose = poseAtDepth(0);
  const innerProject = projectFactor(innerPose.z);
  const innerPerReach = innerPose.spread * innerProject || 1;
  const solve = (limit: number, size: number): CircleFit | null => {
    const innerHalf = (size * innerPose.scale * innerProject) / 2;
    const rimHalf = (size * rimPose.scale * rimProject) / 2;
    // `limit` is the outer stroke radius (token centres), not the footprint edge.
    const radius = Math.min(limit, verticalRoom - rimHalf);
    if (radius < 110) return null;
    const reach = radius / rimPerReach;
    const innerRadius = reach * innerPerReach;
    // Keep token edges outside the hub disc (full half, not a fraction).
    const hubNeed = EXPLORATION.hubClearance + innerHalf;
    if (innerRadius < hubNeed) return null;
    const frame: PlacementFrame = {
      anchorX: input.anchorX,
      anchorY: input.anchorY,
      reachX: reach,
      reachY: reach,
      tokenSize: size,
    };
    if (!circleHolds(frame, input.zones, input.points)) return null;
    return { reach, tokenSize: size };
  };

  // Largest readable size first; ease the circle in only if that size needs it.
  for (let size = input.fullToken; size >= minSize; size -= 2) {
    let fitted = solve(goal, size);
    if (!fitted) {
      for (let scale = 0.98; scale >= 0.62 && !fitted; scale -= 0.02) {
        fitted = solve(goal * scale, size);
      }
    }
    if (fitted) return fitted;
  }
  // Last resort: still clear the hub, even if the outer ring pulls in.
  const minHalf = (minSize * innerPose.scale * innerProject) / 2;
  const hubReach =
    (EXPLORATION.hubClearance + minHalf) / Math.max(innerPerReach, 0.001);
  return {
    reach: Math.max(hubReach, Math.max(110, goal * 0.62) / rimPerReach),
    tokenSize: minSize,
  };
}

/** Room from the orbit centre to the nearest process edge or screen inset. */
function circleClearance(
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
  zones: readonly ScreenRect[],
) {
  const viewport: ScreenRect = {
    left: 28,
    top: 40,
    right: Math.max(28, width - 12),
    bottom: Math.max(40, height - 28),
  };
  let limit = Math.min(
    anchorX - viewport.left,
    viewport.right - anchorX,
    anchorY - viewport.top,
    viewport.bottom - anchorY,
  );
  for (const zone of zones) {
    limit = Math.min(limit, distanceToRect(anchorX, anchorY, guardZone(zone, PLACE_PAD)));
  }
  return Math.max(0, limit - 4);
}

function distanceToRect(x: number, y: number, rect: ScreenRect) {
  const nearestX = Math.min(Math.max(x, rect.left), rect.right);
  const nearestY = Math.min(Math.max(y, rect.top), rect.bottom);
  return Math.hypot(x - nearestX, y - nearestY);
}

/**
 * True when each ring can keep its even angles without self-overlap.
 * Adjacent-ring gaps are settled later when tokens slide around the process.
 */
function circleHolds(
  frame: PlacementFrame,
  zones: readonly ScreenRect[],
  points: readonly CirclePoint[],
) {
  const guarded = zones.map((item) => guardZone(item, PLACE_PAD));
  const anchors: MutableAnchor[] = points.map((point) => ({
    x: point.x,
    y: point.y,
    presence: point.presence,
    group: point.group,
    radius: Math.hypot(point.x, point.y) || 1,
  }));
  for (const anchor of anchors) {
    if (angleBlocked(anchor, anchorAngle(anchor), frame, guarded, true)) {
      return false;
    }
  }
  for (let left = 0; left < anchors.length; left += 1) {
    for (let right = left + 1; right < anchors.length; right += 1) {
      const a = anchors[left];
      const b = anchors[right];
      if (a.group !== b.group) continue;
      if (circlesOverlap(a, Math.min(a.group, 2), b, Math.min(b.group, 2), frame)) {
        return false;
      }
    }
  }
  return true;
}

/** Orbit centre in the open screen beside the protected process. */
export function sceneAnchor(
  zone: ScreenRect,
  width: number,
  height: number,
): { x: number; y: number } {
  const y = height * 0.48;
  const right = Math.max(0, width - zone.right);
  const left = Math.max(0, zone.left);
  let x = right >= left ? zone.right + right * 0.5 : Math.max(48, left * 0.45);
  x = Math.min(width * 0.7, Math.max(width * 0.54, x));
  const inside =
    x > zone.left && x < zone.right && y > zone.top && y < zone.bottom;
  if (inside) x = Math.min(width * 0.74, zone.right + 120);
  return { x, y };
}
