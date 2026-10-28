import type { PointerEvent as ReactPointerEvent } from "react";
import {
  artFrame,
  centroid,
  downwardLabelSpin,
  geometryFor,
  polygonPoints,
} from "../process/tokenGeometry";
import { tokenTransform } from "../process/processLayout";
import type { PlacedToken, Point } from "../process/processTypes";

/** phase.png is square. These vertices are its outer edge, including the white stroke. */
const PHASE_FILE = 235;
const PHASE_BODY: Point[] = [
  { x: 117.5, y: 6 },
  { x: 223, y: 83 },
  { x: 184, y: 205 },
  { x: 51, y: 205 },
  { x: 12, y: 84 },
];

type PentagonArt = {
  width: number;
  height: number;
  /** Point-up pentagon, in the image's pixels. */
  body: readonly Point[];
  /** Extra scale so the artwork covers the slot. Keep this near 1 so the white stroke stays inside the clip. */
  cover?: number;
};

type ProcessTokenViewProps = {
  placed: PlacedToken;
  /** Hide the blue pentagon while a phase token is standing in for it. */
  hidePentagon?: boolean;
  /** Drawn into the blue pentagon, in the token's own pixels. */
  pentagonImage?: string;
  /** Outline of pentagonImage. Defaults to the phase.png placeholder. */
  pentagonArt?: PentagonArt;
  /** Extra pentagon turns for the picture seated in the starting point. */
  seatedTurn?: number;
  /** Click the token's pentagon. Starting Point and Endpoint stay silent. */
  onSelect?: () => void;
  selectLabel?: string;
  selected?: boolean;
  /** Sits behind an open phase or activity radar. */
  behind?: boolean;
};

const PHASE_PLACEHOLDER: PentagonArt = {
  width: PHASE_FILE,
  height: PHASE_FILE,
  body: PHASE_BODY,
  cover: 1.02,
};

/** Where phase.png sits inside a pentagon so its white stroke stays visible. */
export function phasePlaceholderSlot(points: readonly Point[]) {
  return phaseSlot(points, PHASE_PLACEHOLDER);
}

export function ProcessTokenView({
  placed,
  hidePentagon = false,
  pentagonImage,
  pentagonArt,
  seatedTurn = 0,
  onSelect,
  selectLabel,
  selected = false,
  behind = false,
}: ProcessTokenViewProps) {
  const geometry = geometryFor(placed.token);
  const frame = artFrame(geometry);
  const art = pentagonArt ?? PHASE_PLACEHOLDER;
  const slot =
    geometry.pentagon && pentagonImage && art.body.length > 0
      ? phaseSlot(geometry.pentagon, art)
      : null;
  const editable =
    placed.token.type === "phase" || placed.token.type === "activity";
  const hit = onSelect ? (geometry.outline ?? geometry.pentagon) : null;
  const spin = editable
    ? downwardLabelSpin(placed.heading) + (placed.token.turn ?? 0) * 72
    : 0;
  const pivot = geometry.outline ? centroid(geometry.outline) : null;

  return (
    <div
      className={
        behind ? "process-token process-token--behind" : "process-token"
      }
      style={{ transform: tokenTransform(placed) }}
      role="img"
      aria-label={placed.token.label}
      data-token-id={placed.token.id}
      data-token-type={placed.token.type}
      data-selected={selected ? "true" : undefined}
    >
      <div
        className="process-token__art"
        style={{ width: frame.width, height: frame.height }}
      >
        <div
          className="process-token__spin"
          style={
            spin !== 0 && pivot && geometry.outline
              ? {
                  transform: `rotate(${spin}deg)`,
                  transformOrigin: `${pivot.x}px ${pivot.y}px`,
                  clipPath: `polygon(${geometry.outline
                    .map(
                      (point) =>
                        `${(point.x / frame.width) * 100}% ${(point.y / frame.height) * 100}%`,
                    )
                    .join(", ")})`,
                }
              : undefined
          }
        >
          <img
            src={`/tokens/${placed.token.asset}`}
            alt=""
            width={geometry.width}
            height={geometry.height}
            draggable={false}
          />
        </div>
        {slot && pentagonImage ? (
          <div
            className="process-token__phase"
            style={{
              width: frame.width,
              height: frame.height,
              clipPath: `polygon(${(geometry.pentagon ?? [])
                .map(
                  (point) =>
                    `${(point.x / frame.width) * 100}% ${(point.y / frame.height) * 100}%`,
                )
                .join(", ")})`,
            }}
          >
            <img
              src={pentagonImage}
              alt=""
              draggable={false}
              style={{
                left: slot.x,
                top: slot.y,
                width: slot.width,
                height: slot.height,
                transform: `rotate(${90 + downwardLabelSpin(Math.PI / 2) + seatedTurn * 72}deg)`,
                transformOrigin: `${slot.originX}px ${slot.originY}px`,
              }}
            />
          </div>
        ) : null}
        {geometry.pentagon && !hidePentagon ? (
          <svg
            className="process-token__mark"
            viewBox={`0 0 ${frame.width} ${frame.height}`}
            width={frame.width}
            height={frame.height}
            aria-hidden="true"
          >
            <polygon points={polygonPoints(geometry.pentagon)} fill="#082eef" />
          </svg>
        ) : null}
        {hit && onSelect ? (
          <svg
            className="process-token__hit"
            viewBox={`0 0 ${frame.width} ${frame.height}`}
            width={frame.width}
            height={frame.height}
          >
            <polygon
              points={polygonPoints(hit)}
              role="button"
              tabIndex={0}
              aria-label={`Select ${selectLabel ?? placed.token.label}`}
              aria-pressed={selected}
              onPointerDown={stopTokenPointer}
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect();
              }}
            />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

function stopTokenPointer(event: ReactPointerEvent) {
  event.stopPropagation();
}

/**
 * Turn the point-up phase artwork so its tip points the same way as the
 * starting-point pentagon, then scale it so the white stroke stays inside the slot.
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
