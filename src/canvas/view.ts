/** Camera for the workspace. Process tokens will use this same view later. */
export type CanvasView = {
  x: number;
  y: number;
  scale: number;
};

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export const INITIAL_VIEW: CanvasView = {
  x: 0,
  y: 0,
  scale: 1,
};

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

export function zoomPercent(scale: number): number {
  return Math.round(scale * 100);
}

/**
 * Zoom while keeping the world point under (localX, localY) fixed.
 * localX/localY are viewport coordinates, origin at the canvas top-left.
 */
export function zoomAtPoint(
  view: CanvasView,
  localX: number,
  localY: number,
  nextScale: number,
): CanvasView {
  const scale = clampZoom(nextScale);
  const worldX = (localX - view.x) / view.scale;
  const worldY = (localY - view.y) / view.scale;

  return {
    scale,
    x: localX - worldX * scale,
    y: localY - worldY * scale,
  };
}

export function worldTransform(view: CanvasView): string {
  return `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
}

export function screenToWorld(view: CanvasView, localX: number, localY: number) {
  return {
    x: (localX - view.x) / view.scale,
    y: (localY - view.y) / view.scale,
  };
}

export function worldToScreen(view: CanvasView, worldX: number, worldY: number) {
  return {
    x: worldX * view.scale + view.x,
    y: worldY * view.scale + view.y,
  };
}
