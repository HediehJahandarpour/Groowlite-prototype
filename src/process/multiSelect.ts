import type { CanvasView } from "../canvas/view";
import { worldToScreen } from "../canvas/view";
import { layoutProcess, tokenWorldOutline } from "./processLayout";
import type { PlacedToken, Point, ProcessToken } from "./processTypes";

export type ScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Phases, activities, and checkpoints can join a multi-selection. */
export function isSelectableToken(token: ProcessToken) {
  return (
    token.type === "phase" ||
    token.type === "activity" ||
    token.type === "checkpoint"
  );
}

export function normalizeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): ScreenRect {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return {
    x: left,
    y: top,
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

export function rectsIntersect(a: ScreenRect, b: ScreenRect) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

export function boundsOfPoints(points: readonly Point[]): WorldRect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Expand a world AABB by padding in world units. */
export function padRect(rect: WorldRect, padding: number): WorldRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

export function outlineScreenBounds(
  outline: readonly Point[],
  view: CanvasView,
): ScreenRect | null {
  if (outline.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of outline) {
    const screen = worldToScreen(view, point.x, point.y);
    minX = Math.min(minX, screen.x);
    minY = Math.min(minY, screen.y);
    maxX = Math.max(maxX, screen.x);
    maxY = Math.max(maxY, screen.y);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * World outline for a selectable token, including one seated in the starting
 * point pentagon.
 */
export function selectableOutline(
  placed: PlacedToken[],
  tokens: ProcessToken[],
  id: string,
): Point[] | null {
  const token = tokens.find((item) => item.id === id);
  if (!token || !isSelectableToken(token)) return null;
  const own = placed.find((item) => item.token.id === id);
  if (own) return tokenWorldOutline(own);
  const ordered = tokens
    .filter(isSelectableToken)
    .sort((a, b) => a.order - b.order);
  if (ordered[0]?.id !== id) return null;
  const start = placed.find((item) => item.token.type === "start");
  return start ? tokenWorldOutline(start) : null;
}

/** Ids whose projected screen bounds intersect the drag rectangle. */
export function tokensIntersectingRect(
  placed: PlacedToken[],
  tokens: ProcessToken[],
  view: CanvasView,
  rect: ScreenRect,
): string[] {
  const hits: string[] = [];
  for (const token of tokens) {
    if (!isSelectableToken(token)) continue;
    const outline = selectableOutline(placed, tokens, token.id);
    if (!outline) continue;
    const bounds = outlineScreenBounds(outline, view);
    if (bounds && rectsIntersect(bounds, rect)) hits.push(token.id);
  }
  return hits;
}

/** Collective world AABB around selected token outlines, with padding. */
export function collectiveSelectionBounds(
  placed: PlacedToken[],
  tokens: ProcessToken[],
  selectedIds: readonly string[],
  paddingWorld: number,
): WorldRect | null {
  const points: Point[] = [];
  for (const id of selectedIds) {
    const outline = selectableOutline(placed, tokens, id);
    if (outline) points.push(...outline);
  }
  const bounds = boundsOfPoints(points);
  return bounds ? padRect(bounds, paddingWorld) : null;
}

/** Selected middle tokens in process order. */
export function selectedInProcessOrder(
  tokens: ProcessToken[],
  selectedIds: ReadonlySet<string> | readonly string[],
): ProcessToken[] {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  return tokens
    .filter((token) => isSelectableToken(token) && ids.has(token.id))
    .sort((a, b) => a.order - b.order);
}

/**
 * Layout a temporary process so every selected token sits in its own slot
 * (none seated in the starting point). Used for PNG export only.
 */
export function layoutSelectedSequence(selected: ProcessToken[]): PlacedToken[] {
  if (selected.length === 0) return [];
  const spacer: ProcessToken = {
    id: "__export-spacer",
    type: "phase",
    label: "",
    category: "phase",
    order: 0,
    permanent: false,
    asset: selected[0].asset,
  };
  const start: ProcessToken = {
    id: "__export-start",
    type: "start",
    label: "Starting point",
    category: "anchor",
    order: 0,
    permanent: true,
    asset: "vertrekpunt@2x.png",
  };
  const end: ProcessToken = {
    id: "__export-end",
    type: "end",
    label: "Endpoint",
    category: "anchor",
    order: selected.length + 2,
    permanent: true,
    asset: "eindpunt@2x.png",
  };
  const middles = [
    spacer,
    ...selected.map((token, index) => ({
      ...token,
      order: index + 1,
    })),
  ];
  const layout = layoutProcess([start, ...middles, end]);
  const selectedIds = new Set(selected.map((token) => token.id));
  return layout.placed.filter((item) => selectedIds.has(item.token.id));
}
