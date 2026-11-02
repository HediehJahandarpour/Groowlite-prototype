import type { CanvasView } from "../canvas/view";
import { worldToScreen } from "../canvas/view";
import { placedArtBounds } from "./previewFit";
import { nextPlaceholder, seamPoint } from "../process/insertionPoint";
import { layoutProcess } from "../process/processLayout";
import type { Point, ProcessToken } from "../process/processTypes";
import { EXPLORATION } from "./explorationConfig";

export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

/** Canvas camera that parks a world point at the exploration focus. */
export function viewForWorldPoint(
  world: Point,
  viewport: ViewportSize,
  scale: number,
  focusX = EXPLORATION.processFocusX,
  focusY = EXPLORATION.processFocusY,
): CanvasView {
  const screenX = viewport.width * focusX;
  const screenY = viewport.height * focusY;
  return {
    scale,
    x: screenX - world.x * scale,
    y: screenY - world.y * scale,
  };
}

/** World point the camera should hold: the gap, or the token being replaced. */
export function explorationFocusPoint(
  tokens: ProcessToken[],
  insertionIndex: number,
  replaceId: string | null,
): Point {
  const layout = layoutProcess(tokens);
  if (replaceId) {
    const own = layout.placed.find((item) => item.token.id === replaceId);
    if (own) return { x: own.x, y: own.y };
  }
  const start = layout.placed.find((item) => item.token.type === "start");
  if (!start) return { x: 0, y: 0 };
  const seamCount = layout.occupied + (layout.seatedInStart ? 1 : 0);
  const index = Math.max(0, Math.min(insertionIndex, seamCount));
  return seamPoint(index, start, layout.slots, layout.seatedInStart);
}

export function explorationView(
  tokens: ProcessToken[],
  insertionIndex: number,
  replaceId: string | null,
  viewport: ViewportSize,
): CanvasView {
  return viewForWorldPoint(
    explorationFocusPoint(tokens, insertionIndex, replaceId),
    viewport,
    EXPLORATION.explorationZoom,
  );
}

/**
 * Screen rectangle around the local process, expanded by the safety margin.
 * Coordinates are canvas-local, matching the explorer overlay on the workspace.
 */
export function processExclusionZone(
  tokens: ProcessToken[],
  insertionIndex: number,
  replaceId: string | null,
  view: CanvasView,
  viewport: ViewportSize,
  margin = EXPLORATION.processSafetyMargin,
): ScreenRect {
  const layout = layoutProcess(tokens);
  const focus = explorationFocusPoint(tokens, insertionIndex, replaceId);
  const reach = EXPLORATION.localReach;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (point: Point) => {
    const screen = worldToScreen(view, point.x, point.y);
    minX = Math.min(minX, screen.x);
    minY = Math.min(minY, screen.y);
    maxX = Math.max(maxX, screen.x);
    maxY = Math.max(maxY, screen.y);
  };

  for (const item of layout.placed) {
    if (item.token.type === "end") continue;
    if (Math.hypot(item.x - focus.x, item.y - focus.y) > reach) continue;
    const art = placedArtBounds(item);
    include({ x: art.minX, y: art.minY });
    include({ x: art.maxX, y: art.minY });
    include({ x: art.minX, y: art.maxY });
    include({ x: art.maxX, y: art.maxY });
  }

  const start = layout.placed.find((item) => item.token.type === "start");
  if (start) {
    const seamCount = layout.occupied + (layout.seatedInStart ? 1 : 0);
    const index = Math.max(0, Math.min(insertionIndex, seamCount));
    const slot = nextPlaceholder(index, layout.slots, layout.seatedInStart);
    if (slot) {
      for (const point of slot.polygon) include(point);
    }
  }

  if (!Number.isFinite(minX)) {
    const screen = worldToScreen(view, focus.x, focus.y);
    minX = screen.x;
    minY = screen.y;
    maxX = screen.x;
    maxY = screen.y;
  }

  return {
    left: Math.max(-margin, minX - margin),
    top: Math.max(-margin, minY - margin),
    right: Math.min(viewport.width + margin, maxX + margin),
    bottom: Math.min(viewport.height + margin, maxY + margin),
  };
}
