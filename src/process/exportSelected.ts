import { placedArtBounds, unionBounds } from "../exploration/previewFit";
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
import { layoutProcess, tokenWorldOutline } from "./processLayout";
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

type PentagonArt = {
  width: number;
  height: number;
  body: readonly Point[];
  cover?: number;
};

/**
 * Same seating math as the starting-point pentagon on the canvas:
 * turn the point-up artwork so its tip matches the notch, then scale it
 * so the stroke stays inside the slot.
 */
function phaseSlot(points: readonly Point[], art: PentagonArt) {
  const body = centroid(art.body);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of art.body) {
    const dx = point.x - body.x;
    const dy = point.y - body.y;
    const x = body.x - dy;
    const y = body.y + dx;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const slotMinX = Math.min(...points.map((point) => point.x));
  const slotMinY = Math.min(...points.map((point) => point.y));
  const slotMaxX = Math.max(...points.map((point) => point.x));
  const slotMaxY = Math.max(...points.map((point) => point.y));
  const scale =
    Math.max(
      (slotMaxX - slotMinX) / (maxX - minX),
      (slotMaxY - slotMinY) / (maxY - minY),
    ) * (art.cover ?? 1.05);
  const width = art.width * scale;
  const height = art.height * scale;
  const center = centroid(points);
  return {
    x: center.x - (body.x / art.width) * width,
    y: center.y - (body.y / art.height) * height,
    width,
    height,
    originX: (body.x / art.width) * width,
    originY: (body.y / art.height) * height,
  };
}

function clipPolygon(ctx: CanvasRenderingContext2D, outline: readonly Point[]) {
  ctx.beginPath();
  outline.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.clip();
}

function placeOnCanvas(ctx: CanvasRenderingContext2D, placed: PlacedToken) {
  const geometry = geometryFor(placed.token);
  ctx.translate(placed.x, placed.y);
  ctx.rotate(placed.heading);
  ctx.scale(placed.scale, placed.scale);
  ctx.translate(-geometry.anchor.x, -geometry.anchor.y);
  return geometry;
}

/** First phase or activity, drawn inside the starting point instead of its own slot. */
function seatedToken(tokens: ProcessToken[]): ProcessToken | null {
  const first = tokens
    .filter((token) => token.type === "phase" || token.type === "activity")
    .sort((left, right) => left.order - right.order)[0];
  if (!first || !geometryFor(first).outline) return null;
  return first;
}

function drawPlacedToken(
  ctx: CanvasRenderingContext2D,
  placed: PlacedToken,
  image: HTMLImageElement,
) {
  const geometry = geometryFor(placed.token);
  const editable =
    placed.token.type === "phase" || placed.token.type === "activity";
  const outline = geometry.outline;
  ctx.save();
  placeOnCanvas(ctx, placed);
  if (editable && outline && outline.length >= 3) {
    clipPolygon(ctx, outline);
    const spinDeg =
      downwardLabelSpin(placed.heading) + (placed.token.turn ?? 0) * 72;
    if (spinDeg !== 0) {
      const pivot = centroid(outline);
      ctx.translate(pivot.x, pivot.y);
      ctx.rotate((spinDeg * Math.PI) / 180);
      ctx.translate(-pivot.x, -pivot.y);
    }
  }
  ctx.drawImage(image, 0, 0, geometry.width, geometry.height);
  ctx.restore();
}

function drawSeatedInStart(
  ctx: CanvasRenderingContext2D,
  start: PlacedToken,
  seated: ProcessToken,
  image: HTMLImageElement,
) {
  const pentagon = geometryFor(start.token).pentagon;
  const body = geometryFor(seated).outline;
  if (!pentagon || !body || body.length < 3) return;
  const art: PentagonArt = {
    width: geometryFor(seated).width,
    height: geometryFor(seated).height,
    body,
    cover: 1.06,
  };
  const slot = phaseSlot(pentagon, art);
  const degrees = 90 + downwardLabelSpin(Math.PI / 2) + (seated.turn ?? 0) * 72;
  ctx.save();
  placeOnCanvas(ctx, start);
  clipPolygon(ctx, pentagon);
  ctx.translate(slot.x + slot.originX, slot.y + slot.originY);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.translate(-slot.originX, -slot.originY);
  ctx.drawImage(image, 0, 0, slot.width, slot.height);
  ctx.restore();
}

const MAX_EXPORT_EDGE = 8192;

/**
 * PNG of the live process, including the starting point and endpoint.
 * A token seated in the starting point is drawn into that notch.
 */
export async function exportProcessPng(tokens: ProcessToken[]): Promise<Blob | null> {
  const { placed } = layoutProcess(tokens);
  if (placed.length === 0) return null;

  const bounds = unionBounds(placed.map((item) => placedArtBounds(item)));
  if (!bounds) return null;
  const framed = {
    x: bounds.minX - EXPORT_PADDING,
    y: bounds.minY - EXPORT_PADDING,
    width: bounds.maxX - bounds.minX + EXPORT_PADDING * 2,
    height: bounds.maxY - bounds.minY + EXPORT_PADDING * 2,
  };

  const seated = seatedToken(tokens);
  const images = await Promise.all(
    placed.map((item) => loadImage(`/tokens/${item.token.asset}`)),
  );
  const seatedImage = seated ? await loadImage(`/tokens/${seated.asset}`) : null;

  const longest = Math.max(framed.width, framed.height) * EXPORT_SCALE;
  const scale = longest > MAX_EXPORT_EDGE ? MAX_EXPORT_EDGE / Math.max(framed.width, framed.height) : EXPORT_SCALE;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(framed.width * scale));
  canvas.height = Math.max(1, Math.ceil(framed.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, framed.width, framed.height);
  ctx.translate(-framed.x, -framed.y);

  placed.forEach((item, index) => {
    const image = images[index];
    if (!image) return;
    drawPlacedToken(ctx, item, image);
    if (item.token.type === "start" && seated && seatedImage) {
      drawSeatedInStart(ctx, item, seated, seatedImage);
    }
  });

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export function processExportFilename(name: string): string {
  const base = name
    .trim()
    .replace(/[^\p{L}\p{N}\-_ ]+/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "process"}.png`;
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
