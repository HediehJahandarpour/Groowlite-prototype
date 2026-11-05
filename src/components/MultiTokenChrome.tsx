import type { PointerEvent as ReactPointerEvent } from "react";
import { Copy, Download, Sparkles, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorldRect } from "../process/multiSelect";
import "./MultiTokenChrome.css";

const SELECTION_STROKE = "#0023FF";
const SELECTION_FILL = "rgba(79, 99, 224, 0.12)";
const SELECTION_STROKE_PX = 1.5;

type MultiTokenChromeProps = {
  bounds: WorldRect;
  viewScale: number;
  onCopy: () => void;
  onRemove: () => void;
  onExport: () => void;
  onReflect?: () => void;
  /** Press on the collective bounds to drag the whole selection. */
  onPress?: (event: ReactPointerEvent<SVGRectElement>) => void;
};

const ACTIONS: {
  id: string;
  label: string;
  icon: LucideIcon;
  run: keyof Pick<
    MultiTokenChromeProps,
    "onCopy" | "onRemove" | "onExport" | "onReflect"
  >;
}[] = [
  { id: "reflect", label: "Reflect", icon: Sparkles, run: "onReflect" },
  { id: "copy", label: "Copy", icon: Copy, run: "onCopy" },
  { id: "remove", label: "Remove", icon: Trash2, run: "onRemove" },
  { id: "export", label: "Export", icon: Download, run: "onExport" },
];

function stopPointer(event: ReactPointerEvent) {
  event.stopPropagation();
}

export function MultiTokenChrome({
  bounds,
  viewScale,
  onCopy,
  onRemove,
  onExport,
  onReflect,
  onPress,
}: MultiTokenChromeProps) {
  const scale = viewScale > 0 ? viewScale : 1;
  const strokeWidth = SELECTION_STROKE_PX / scale;
  const handlers = { onCopy, onRemove, onExport, onReflect };
  const actions = ACTIONS.filter((action) => handlers[action.run]);

  return (
    <>
      <svg
        className="multi-selection"
        viewBox="0 0 4000 4000"
        aria-label="Selected tokens"
      >
        <rect
          className="multi-selection__hit"
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          fill={SELECTION_FILL}
          stroke={SELECTION_STROKE}
          strokeWidth={strokeWidth}
          strokeDasharray={`${4 / scale} ${3 / scale}`}
          rx={2 / scale}
          ry={2 / scale}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            stopPointer(event);
            onPress?.(event);
          }}
        />
      </svg>
      <div
        className="multi-toolbar-anchor"
        style={{
          left: bounds.x + bounds.width,
          top: bounds.y,
          transform: `translate(8px, -100%) scale(${1 / scale})`,
        }}
        onPointerDown={stopPointer}
      >
        <div className="multi-toolbar" role="toolbar" aria-label="Edit selection">
          {actions.map(({ id, label, icon: Icon, run }) => {
            const handler = handlers[run];
            if (!handler) return null;
            return (
              <button
                key={id}
                type="button"
                className="multi-toolbar__button"
                aria-label={label}
                title={label}
                onClick={handler}
              >
                <Icon size={18} strokeWidth={2} />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
