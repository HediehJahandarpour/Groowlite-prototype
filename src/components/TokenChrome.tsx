import type { PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { polygonPoints } from "../process/tokenGeometry";
import type { Point } from "../process/processTypes";
import "./TokenChrome.css";

type TokenChromeProps = {
  /** World-space pentagon of the selected token. */
  points: Point[];
  viewScale: number;
  /** Recedes with the process while a radar plate is in front. */
  behind?: boolean;
  onRemove: () => void;
  onSwitch?: () => void;
};

const ACTIONS: {
  id: string;
  label: string;
  icon: LucideIcon;
  run: keyof Pick<TokenChromeProps, "onRemove" | "onSwitch">;
}[] = [
  { id: "remove", label: "Remove", icon: Trash2, run: "onRemove" },
  { id: "switch", label: "Switch", icon: ArrowLeftRight, run: "onSwitch" },
];

function stopPointer(event: ReactPointerEvent) {
  event.stopPropagation();
}

export function TokenChrome({
  points,
  viewScale,
  behind = false,
  onRemove,
  onSwitch,
}: TokenChromeProps) {
  if (points.length < 3) return null;
  const scale = viewScale > 0 ? viewScale : 1;
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const top = Math.min(...points.map((point) => point.y));
  const handlers = { onRemove, onSwitch };
  const actions = ACTIONS.filter((action) => action.run !== "onSwitch" || onSwitch);

  return (
    <>
      <svg
        className={behind ? "token-selection token-selection--behind" : "token-selection"}
        viewBox="0 0 4000 4000"
        aria-hidden="true"
      >
        <polygon
          points={polygonPoints(points)}
          fill="rgba(8, 46, 239, 0.14)"
          stroke="#082eef"
          strokeWidth={2 / scale}
          strokeLinejoin="round"
        />
      </svg>
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
