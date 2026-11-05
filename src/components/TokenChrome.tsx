import type { PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeftRight, RotateCw, Sparkles, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { polygonPoints } from "../process/tokenGeometry";
import type { Point } from "../process/processTypes";
import "./TokenChrome.css";

/** Selection frame from the canvas token in Figma (node 253:63129). */
const SELECTION_STROKE = "#0023FF";
const SELECTION_FILL = "#4F63E0";
const SELECTION_STROKE_PX = 2;

type TokenChromeProps = {
  /** World-space pentagon of the selected token. */
  points: Point[];
  viewScale: number;
  /** Recedes with the process while a radar plate is in front. */
  behind?: boolean;
  onRemove: () => void;
  onRotate?: () => void;
  onSwitch?: () => void;
  onReflect?: () => void;
};

const ACTIONS: {
  id: string;
  label: string;
  icon: LucideIcon;
  run: keyof Pick<
    TokenChromeProps,
    "onRemove" | "onRotate" | "onSwitch" | "onReflect"
  >;
}[] = [
  { id: "reflect", label: "Reflect", icon: Sparkles, run: "onReflect" },
  { id: "remove", label: "Remove", icon: Trash2, run: "onRemove" },
  { id: "rotate", label: "Rotate", icon: RotateCw, run: "onRotate" },
  { id: "switch", label: "Switch", icon: ArrowLeftRight, run: "onSwitch" },
];

function stopPointer(event: ReactPointerEvent) {
  event.stopPropagation();
}

/** Blue pentagonal outline for one selected token. */
export function SelectedTokenOutline({
  points,
  viewScale,
  behind = false,
}: {
  points: Point[];
  viewScale: number;
  behind?: boolean;
}) {
  if (points.length < 3) return null;
  const scale = viewScale > 0 ? viewScale : 1;
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const strokeWidth = SELECTION_STROKE_PX / scale;
  const frame = points.map((point) => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const reach = Math.hypot(dx, dy) || 1;
    const push = strokeWidth / 2;
    return {
      x: point.x + (dx / reach) * push,
      y: point.y + (dy / reach) * push,
    };
  });

  return (
    <svg
      className={behind ? "token-selection token-selection--behind" : "token-selection"}
      viewBox="0 0 4000 4000"
      aria-hidden="true"
    >
      <polygon
        points={polygonPoints(points)}
        fill={SELECTION_FILL}
        fillOpacity={0.2}
        stroke="none"
      />
      <polygon
        points={polygonPoints(frame)}
        fill="none"
        stroke={SELECTION_STROKE}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function TokenChrome({
  points,
  viewScale,
  behind = false,
  onRemove,
  onRotate,
  onSwitch,
  onReflect,
}: TokenChromeProps) {
  if (points.length < 3) return null;
  const scale = viewScale > 0 ? viewScale : 1;
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const top = Math.min(...points.map((point) => point.y));
  const handlers = { onRemove, onRotate, onSwitch, onReflect };
  const actions = ACTIONS.filter((action) => handlers[action.run]);

  return (
    <>
      <SelectedTokenOutline points={points} viewScale={viewScale} behind={behind} />
      <div
        className={
          behind
            ? "token-toolbar-anchor token-toolbar-anchor--behind"
            : "token-toolbar-anchor"
        }
        style={{
          left: centerX,
          top: top - 12 / scale,
          transform: `translate(-50%, -100%) scale(${1 / scale})`,
        }}
        onPointerDown={stopPointer}
      >
        <div className="token-toolbar" role="toolbar" aria-label="Edit token">
          {actions.map(({ id, label, icon: Icon, run }) => (
            <button
              key={id}
              type="button"
              className="token-toolbar__button"
              aria-label={label}
              onClick={handlers[run]}
            >
              <Icon size={20} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
