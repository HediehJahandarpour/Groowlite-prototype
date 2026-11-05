import type { CanvasView } from "../canvas/view";
import { screenToWorld, worldToScreen } from "../canvas/view";
import { explorationIndex } from "./contextToken";
import type { ScreenRect, ViewportSize } from "./cameraFocus";
import { EXPLORATION } from "./explorationConfig";
import { placedArtBounds } from "./previewFit";
import { layoutProcess } from "../process/processLayout";
import type { PlacedToken, Point, ProcessToken } from "../process/processTypes";

/**
 * Temporary screen placement for one process token while exploration is open.
 * These numbers are not written back to the process.
 */
export type SplitPose = {
  /** World-space translation applied after the magnetic placement. */
  x: number;
  y: number;
  /** Uniform scale of this side. 1 leaves the token at its canvas size. */
  scale: number;
  /** 0 fades the token out once the split has opened. */
  opacity: number;
};

export type ProcessSplit = {
  poses: Record<string, SplitPose>;
  zones: ScreenRect[];
  /** Placed tokens shown on the left, nearest the gap last. */
  leftIds: string[];
  /** At most three upcoming tokens, nearest the gap first. Endpoint excluded. */
  rightIds: string[];
};

type Motion = {
  x: number;
  y: number;
  scale: number;
};

function middles(tokens: readonly ProcessToken[]): ProcessToken[] {
  return tokens
    .filter(
      (token) =>
        token.type === "phase" ||
        token.type === "activity" ||
        token.type === "checkpoint",
    )
    .slice()
    .sort((left, right) => left.order - right.order);
}

function artCenter(item: PlacedToken): Point {
  const box = placedArtBounds(item);
  return {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2,
  };
}

function projectBounds(
  item: PlacedToken,
  motion: Motion,
  view: CanvasView,
): ScreenRect {
  const box = placedArtBounds(item);
  const corners = [
    [box.minX, box.minY],
    [box.maxX, box.minY],
    [box.maxX, box.maxY],
    [box.minX, box.maxY],
  ];
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const [x, y] of corners) {
    const screen = worldToScreen(view, x * motion.scale + motion.x, y * motion.scale + motion.y);
    left = Math.min(left, screen.x);
    top = Math.min(top, screen.y);
    right = Math.max(right, screen.x);
    bottom = Math.max(bottom, screen.y);
  }
  return { left, top, right, bottom };
}

/** Shift a whole side so its anchor token lands on a screen x, keeping its y. */
function motionFor(
  anchor: PlacedToken,
  scale: number,
  targetX: number,
  view: CanvasView,
): Motion {
  const center = artCenter(anchor);
  const screen = worldToScreen(view, center.x, center.y);
  const target = screenToWorld(view, targetX, screen.y);
  return {
    x: target.x - center.x * scale,
    y: target.y - center.y * scale,
    scale,
  };
}

/**
 * Keep the visible cluster out of the centre without pushing its anchor
 * off the screen. One correction, so the result stays deterministic.
 */
function settleHorizontal(
  tokens: PlacedToken[],
  anchor: PlacedToken,
  motion: Motion,
  view: CanvasView,
  viewport: ViewportSize,
  side: "left" | "right",
): Motion {
  if (tokens.length === 0) return motion;
  const boxes = tokens.map((item) => projectBounds(item, motion, view));
  const anchorBox = projectBounds(anchor, motion, view);
  const limit =
    viewport.width * (side === "left" ? EXPLORATION.splitLeftLimit : EXPLORATION.splitRightLimit);
  let dx = 0;
  if (side === "left") {
    const maxRight = Math.max(...boxes.map((box) => box.right));
    if (maxRight > limit) dx = limit - maxRight;
  } else {
    const minLeft = Math.min(...boxes.map((box) => box.left));
    if (minLeft < limit) dx = limit - minLeft;
  }
  const mid = (anchorBox.left + anchorBox.right) / 2 + dx;
  // Right side stays near the viewport edge so it clears the phase arc.
  const minMid = viewport.width * (side === "left" ? 0.08 : 0.78);
  const maxMid = viewport.width * (side === "left" ? 0.32 : 0.96);
  if (mid < minMid) dx += minMid - mid;
  if (mid > maxMid) dx -= mid - maxMid;
  if (dx === 0) return motion;
  return { ...motion, x: motion.x + dx / view.scale };
}

function pad(rect: ScreenRect, margin: number): ScreenRect {
  return {
    left: rect.left - margin,
    top: rect.top - margin,
    right: rect.right + margin,
    bottom: rect.bottom + margin,
  };
}

function unionRects(rects: ScreenRect[]): ScreenRect | null {
  if (rects.length === 0) return null;
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

/**
 * Left and right views of one ordered process.
 * The magnetic layout is unchanged. Each side is one rigid motion,
 * so tokens on that side keep their connections and rotation.
 */
export function buildProcessSplit(
  tokens: readonly ProcessToken[],
  insertionIndex: number,
  replaceId: string | null,
  view: CanvasView,
  viewport: ViewportSize,
): ProcessSplit {
  const layout = layoutProcess([...tokens]);
  const middle = middles(tokens);
  const index = explorationIndex(tokens, insertionIndex, null);
  const chain = layout.placed.filter(
    (item) =>
      item.token.type === "phase" ||
      item.token.type === "activity" ||
      item.token.type === "checkpoint",
  );
  const start = layout.placed.find((item) => item.token.type === "start");
  let chainBefore = layout.seatedInStart ? Math.max(0, index - 1) : index;
  if (replaceId) {
    const at = middle.findIndex((token) => token.id === replaceId);
    if (at >= 0) chainBefore = layout.seatedInStart ? Math.max(0, at) : at + 1;
  }
  const leftTokens = start ? [start, ...chain.slice(0, chainBefore)] : chain.slice(0, chainBefore);
  const rightTokens = chain.slice(chainBefore);
  const poses: Record<string, SplitPose> = {};
  const zones: ScreenRect[] = [];
  const leftIds: string[] = [];
  const rightIds: string[] = [];

  if (leftTokens.length > 0) {
    const anchor = leftTokens[leftTokens.length - 1];
    const nearest = leftTokens.slice(-EXPLORATION.splitVisible);
    const motion = settleHorizontal(
      nearest,
      anchor,
      motionFor(anchor, EXPLORATION.splitLeftScale, viewport.width * EXPLORATION.splitLeftX, view),
      view,
      viewport,
      "left",
    );
    const nearestIds = new Set(nearest.map((item) => item.token.id));
    const boxes: ScreenRect[] = [];
    for (const item of leftTokens) {
      const box = projectBounds(item, motion, view);
      const center = (box.left + box.right) / 2;
      const visible =
        nearestIds.has(item.token.id) || center <= viewport.width * EXPLORATION.splitLeftLimit;
      poses[item.token.id] = {
        x: motion.x,
        y: motion.y,
        scale: motion.scale,
        opacity: visible ? 1 : 0,
      };
      if (!visible) continue;
      leftIds.push(item.token.id);
      boxes.push(box);
    }
    const zone = unionRects(boxes);
    if (zone) zones.push(pad(zone, EXPLORATION.splitMargin));
  }

  if (rightTokens.length > 0) {
    const shown = rightTokens.slice(0, EXPLORATION.splitVisible);
    const anchor = shown[0];
    const motion = settleHorizontal(
      shown,
      anchor,
      motionFor(anchor, EXPLORATION.splitRightScale, viewport.width * EXPLORATION.splitRightX, view),
      view,
      viewport,
      "right",
    );
    const boxes: ScreenRect[] = [];
    rightTokens.forEach((item, itemIndex) => {
      const visible = itemIndex < EXPLORATION.splitVisible;
      poses[item.token.id] = {
        x: motion.x,
        y: motion.y,
        scale: motion.scale,
        opacity: visible ? 1 : 0,
      };
      if (!visible) return;
      rightIds.push(item.token.id);
      boxes.push(projectBounds(item, motion, view));
    });
    const zone = unionRects(boxes);
    if (zone) zones.push(pad(zone, EXPLORATION.splitMargin));
  }

  return { poses, zones, leftIds, rightIds };
}
