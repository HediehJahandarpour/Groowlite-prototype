import {
  artFrame,
  centroid,
  downwardLabelSpin,
  geometryFor,
} from "./tokenGeometry";
import {
  boundsOfPoints,
  layoutSelectedSequence,
  padRect,
  selectedInProcessOrder,
} from "./multiSelect";
import { tokenWorldOutline } from "./processLayout";
import type { PlacedToken, Point, ProcessToken } from "./processTypes";

const EXPORT_PADDING = 24;
const EXPORT_SCALE = 2;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}

function drawToken(ctx: CanvasRenderingContext2D, placed: PlacedToken, image: HTMLImageElement) {
  const geometry = geometryFor(placed.token);
  const frame = artFrame(geometry);
  const editable =
    placed.token.type === "phase" || placed.token.type === "activity";
  const spinDeg = editable
    ? downwardLabelSpin(placed.heading) + (placed.token.turn ?? 0) * 72
    : 0;
  const outline = geometry.outline ?? geometry.pentagon;

  ctx.save();
  ctx.translate(placed.x, placed.y);
  ctx.rotate(placed.heading);
  ctx.scale(placed.scale, placed.scale);
  ctx.translate(-geometry.anchor.x, -geometry.anchor.y);

  if (outline && outline.length >= 3) {
    ctx.beginPath();
    outline.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.clip();
  }

  if (spinDeg !== 0 && outline) {
    const pivot = centroid(outline);
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate((spinDeg * Math.PI) / 180);
    ctx.translate(-pivot.x, -pivot.y);
  }

  ctx.drawImage(image, 0, 0, frame.width, frame.height);
  ctx.restore();
}

function worldOutlines(placed: PlacedToken[]): Point[] {
  const points: Point[] = [];
  for (const item of placed) {
    points.push(...tokenWorldOutline(item));
  }
  return points;
}

/**
 * Build a PNG of the selected tokens as a compact magnetic sequence.
 * Does not mutate the live process.
 */
export async function exportSelectedTokensPng(
  tokens: ProcessToken[],
  selectedIds: ReadonlySet<string> | readonly string[],
): Promise<Blob | null> {
  const selected = selectedInProcessOrder(tokens, selectedIds);
  if (selected.length === 0) return null;

  const placed = layoutSelectedSequence(selected);
  if (placed.length === 0) return null;

  const bounds = boundsOfPoints(worldOutlines(placed));
  if (!bounds) return null;
  const framed = padRect(bounds, EXPORT_PADDING);

  const images = await Promise.all(
    placed.map((item) => loadImage(`/tokens/${item.token.asset}`)),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(framed.width * EXPORT_SCALE));
  canvas.height = Math.max(1, Math.ceil(framed.height * EXPORT_SCALE));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
  ctx.clearRect(0, 0, framed.width, framed.height);
  ctx.translate(-framed.x, -framed.y);

  placed.forEach((item, index) => {
    drawToken(ctx, item, images[index]);
  });

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
