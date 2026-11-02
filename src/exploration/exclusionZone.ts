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
};

/**
 * Depth at which a token is largest while still fully visible.
 * Past this, the existing pass fade has already started.
 */
export function foregroundDepth(): number {
  return -IMMERSIVE_DEPTH.passDepth * IMMERSIVE_DEPTH.passFadeStart;
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

/** Smallest move that places the rectangle fully outside the zone. */
function pushCenter(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  zone: ScreenRect,
): { x: number; y: number } {
  const rect = {
    left: x - halfW,
    top: y - halfH,
    right: x + halfW,
    bottom: y + halfH,
  };
  if (separated(rect, zone)) return { x, y };
  const pad = EXPLORATION.fadeBuffer;
  const options = [
    { x: x - (rect.right - zone.left + pad), y, cost: rect.right - zone.left },
    { x: x + (zone.right - rect.left + pad), y, cost: zone.right - rect.left },
    { x, y: y - (rect.bottom - zone.top + pad), cost: rect.bottom - zone.top },
    { x, y: y + (zone.bottom - rect.top + pad), cost: zone.bottom - rect.top },
  ];
  options.sort((a, b) => a.cost - b.cost);
  return { x: options[0].x, y: options[0].y };
}

function screenToNormalized(
  x: number,
  y: number,
  depth: number,
  frame: PlacementFrame,
): { x: number; y: number } {
  const pose = poseAtDepth(depth);
  const project = projectFactor(pose.z);
  const spanX = frame.reachX * pose.spread * project || 1;
  const spanY = frame.reachY * pose.spread * project || 1;
  return {
    x: (x - frame.anchorX) / spanX,
    y: (y - frame.anchorY) / spanY,
  };
}

function normalizedToScreen(
  x: number,
  y: number,
  depth: number,
  presence: number,
  frame: PlacementFrame,
): { x: number; y: number; half: number } {
  const pose = poseAtDepth(depth);
  const project = projectFactor(pose.z);
  return {
    x: frame.anchorX + x * frame.reachX * pose.spread * project,
    y: frame.anchorY + y * frame.reachY * pose.spread * project,
    half: (frame.tokenSize * presence * pose.scale * project) / 2,
  };
}

function footprintClears(
  x: number,
  y: number,
  depth: number,
  presence: number,
  frame: PlacementFrame,
  zone: ScreenRect,
): boolean {
  const screen = normalizedToScreen(x, y, depth, presence, frame);
  return separated(
    {
      left: screen.x - screen.half,
      top: screen.y - screen.half,
      right: screen.x + screen.half,
      bottom: screen.y + screen.half,
    },
    zone,
  );
}

/**
 * Draw a token back toward the gradient along its own ray until it clears
 * the process. Angle is kept, so a left-hand arc stays an arc.
 * A sideways slide is only used when that ray still runs through the zone.
 */
function relaxAwayFromZone(
  x: number,
  y: number,
  depth: number,
  presence: number,
  frame: PlacementFrame,
  zone: ScreenRect,
): { x: number; y: number } {
  if (footprintClears(x, y, depth, presence, frame, zone)) return { x, y };
  const angle = Math.atan2(y, x);
  let radius = Math.hypot(x, y) || 0.7;
  for (let step = 0; step < 14; step += 1) {
    radius = Math.max(0.38, radius - 0.05);
    const next = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    if (footprintClears(next.x, next.y, depth, presence, frame, zone)) return next;
    if (radius <= 0.38) break;
  }
  let slide = angle;
  const spin = Math.sin(angle) >= 0 ? -1 : 1;
  for (let step = 0; step < 16; step += 1) {
    slide += spin * 0.16;
    const next = { x: Math.cos(slide) * radius, y: Math.sin(slide) * radius };
    if (footprintClears(next.x, next.y, depth, presence, frame, zone)) return next;
  }
  const screen = normalizedToScreen(x, y, depth, presence, frame);
  const pushed = pushCenter(screen.x, screen.y, screen.half, screen.half, zone);
  return screenToNormalized(pushed.x, pushed.y, depth, frame);
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

/**
 * Move resting anchors so they miss every protected process segment,
 * including the fade margin. The same inputs always return the same
 * anchors. Scroll does not call this.
 */
export function avoidProcessZone(
  candidates: SpatialCandidate[],
  zone: ZoneInput,
  frame: PlacementFrame,
): SpatialCandidate[] {
  const zones = listZones(zone);
  if (zones.length === 0) return candidates;
  // Resting size only. Scroll still fades a token that grows into a segment,
  // so the field can stay on its arc instead of being stacked on the boundary.
  const guarded = zones.map((item) => guardZone(item, EXPLORATION.fadeBuffer));
  const depths = [0];
  return candidates.map((item) => {
    let x = item.x;
    let y = item.y;
    for (let pass = 0; pass < 4; pass += 1) {
      let moved = false;
      for (const depth of depths) {
        for (const region of guarded) {
          const next = relaxAwayFromZone(x, y, depth, item.presence, frame, region);
          if (next.x === x && next.y === y) continue;
          x = next.x;
          y = next.y;
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (x === item.x && y === item.y) return item;
    return { ...item, x, y };
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
