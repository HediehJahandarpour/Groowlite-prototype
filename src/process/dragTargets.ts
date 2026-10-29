import type { CanvasView } from "../canvas/view";
import { worldToScreen } from "../canvas/view";
import { DRAG } from "./dragConfig";
import { poseCentered, type DragPose } from "./dragPose";
import { layoutProcess, tokenWorldOutline, type ProcessLayout } from "./processLayout";
import { middleTokens, moveProcessBlock } from "./reorderToken";
import { imageToWorld, SLOT_EDGE } from "./slotLayout";
import { ACTIVITY_TO_PHASE, centroid, geometryFor } from "./tokenGeometry";
import type { PlacedToken, Point, ProcessToken } from "./processTypes";

export type DropCandidate = {
  /** Insertion index after the dragged span has been removed. */
  index: number;
  x: number;
  y: number;
};

function isChain(token: ProcessToken) {
  return token.type === "phase" || token.type === "activity" || token.type === "checkpoint";
}

/** First phase or activity, drawn inside the starting-point pentagon. */
export function seatedId(tokens: readonly ProcessToken[]): string | null {
  const first = middleTokens(tokens)[0];
  if (!first || (first.type !== "phase" && first.type !== "activity")) return null;
  return first.id;
}

function startPentagon(layout: ProcessLayout): Point[] {
  const start = layout.placed.find((item) => item.token.type === "start");
  if (!start) return [];
  const geometry = geometryFor(start.token);
  const pentagon = geometry.pentagon;
  if (!pentagon) return [];
  return pentagon.map((point) =>
    imageToWorld(point, geometry.anchor, { x: start.x, y: start.y }, start.heading, start.scale),
  );
}

/** Magnetic seat of one token: its slot polygon, or the starting pentagon when it is seated. */
export function slotPolygon(layout: ProcessLayout, tokens: readonly ProcessToken[], id: string): Point[] {
  if (seatedId(tokens) === id) return startPentagon(layout);
  const chain = layout.placed.filter((item) => isChain(item.token));
  const index = chain.findIndex((item) => item.token.id === id);
  if (index < 0) return [];
  return layout.slots[index]?.polygon ?? [];
}

export function tokenCenter(layout: ProcessLayout, tokens: readonly ProcessToken[], id: string): Point | null {
  if (seatedId(tokens) === id) {
    const polygon = startPentagon(layout);
    return polygon.length > 0 ? centroid(polygon) : null;
  }
  const placed = layout.placed.find((item) => item.token.id === id);
  if (!placed) return null;
  const outline = tokenWorldOutline(placed);
  return outline.length > 0 ? centroid(outline) : null;
}

function nominalScale(token: ProcessToken): number {
  const width = geometryFor(token).inputWidth;
  if (!width) return 0.36;
  if (token.type === "activity") return (SLOT_EDGE * ACTIVITY_TO_PHASE) / width;
  return SLOT_EDGE / width;
}

function placedPose(placed: PlacedToken): DragPose {
  return { x: placed.x, y: placed.y, heading: placed.heading, scale: placed.scale };
}

/** Slot poses. The grabbed token is turned upright around its current centre. */
export function pickupPoses(
  tokens: readonly ProcessToken[],
  ids: readonly string[],
  primaryId: string,
): Record<string, DragPose> {
  const layout = layoutProcess(tokens as ProcessToken[]);
  const poses: Record<string, DragPose> = {};
  for (const id of ids) {
    const token = tokens.find((item) => item.id === id);
    if (!token) continue;
    const placed = layout.placed.find((item) => item.token.id === id);
    if (id === primaryId) {
      const center = tokenCenter(layout, tokens, id);
      const scale = placed?.scale ?? nominalScale(token);
      if (center) poses[id] = poseCentered(token, center, scale, 0);
      else if (placed) poses[id] = { ...placedPose(placed), heading: 0 };
      continue;
    }
    if (placed) poses[id] = placedPose(placed);
    else {
      const center = tokenCenter(layout, tokens, id);
      if (center) poses[id] = poseCentered(token, center, nominalScale(token), 0);
    }
  }
  return poses;
}

/** Poses the span will have once it sits in `tokens`. */
export function restingPoses(tokens: readonly ProcessToken[], ids: readonly string[]): Record<string, DragPose> {
  const layout = layoutProcess(tokens as ProcessToken[]);
  const poses: Record<string, DragPose> = {};
  for (const id of ids) {
    const token = tokens.find((item) => item.id === id);
    if (!token) continue;
    const placed = layout.placed.find((item) => item.token.id === id);
    if (placed) {
      poses[id] = placedPose(placed);
      continue;
    }
    const center = tokenCenter(layout, tokens, id);
    if (center) poses[id] = poseCentered(token, center, nominalScale(token), 0);
  }
  return poses;
}

/**
 * One screen point per insertion index, measured to where the grabbed token
 * would sit. Indexes that cannot be laid out are left out.
 */
export function dropCandidates(
  tokens: readonly ProcessToken[],
  sourceIndex: number,
  count: number,
  primaryId: string,
  view: CanvasView,
): DropCandidate[] {
  const remaining = middleTokens(tokens).length - count;
  if (remaining < 0) return [];
  const candidates: DropCandidate[] = [];
  for (let index = 0; index <= remaining; index += 1) {
    const preview = moveProcessBlock(tokens, sourceIndex, count, index);
    let layout: ProcessLayout;
    try {
      layout = layoutProcess(preview);
    } catch {
      continue;
    }
    const center = tokenCenter(layout, preview, primaryId);
    if (!center) continue;
    const screen = worldToScreen(view, center.x, center.y);
    candidates.push({ index, x: screen.x, y: screen.y });
  }
  return candidates;
}

/**
 * Nearest insertion index inside the snap radius.
 * The current target stays put until another is clearly closer.
 * `null` means the pointer is not over a slot.
 */
export function chooseDropIndex(
  candidates: readonly DropCandidate[],
  pointer: Point,
  current: number,
  snapRadius = DRAG.snapRadiusPx,
  hysteresis = DRAG.hysteresisPx,
): number | null {
  if (candidates.length === 0) return null;
  let nearest = candidates[0];
  let nearestDistance = Infinity;
  const distances = new Map<number, number>();
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - pointer.x, candidate.y - pointer.y);
    distances.set(candidate.index, distance);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  const currentDistance = distances.get(current);
  if (
    currentDistance !== undefined &&
    currentDistance <= snapRadius + hysteresis &&
    nearest.index !== current &&
    nearestDistance + hysteresis >= currentDistance
  ) {
    return current;
  }
  if (nearestDistance <= snapRadius) return nearest.index;
  return null;
}

/** Camera nudge while the pointer sits in the viewport edge band. */
export function autoPanDelta(localX: number, localY: number, width: number, height: number) {
  const edge = DRAG.autoPanEdgePx;
  const max = DRAG.autoPanMaxPx;
  const push = (distance: number) => {
    if (distance >= edge) return 0;
    const amount = Math.min(1, Math.max(0, (edge - distance) / edge));
    return max * amount;
  };
  const x = localX < width / 2 ? push(localX) : -push(width - localX);
  const y = localY < height / 2 ? push(localY) : -push(height - localY);
  return { x: x || 0, y: y || 0 };
}
