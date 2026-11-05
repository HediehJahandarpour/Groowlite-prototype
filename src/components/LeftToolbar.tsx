import { MousePointer2, Plus, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./LeftToolbar.css";

export type CanvasTool = "add" | "select";

const TOOLS: { id: CanvasTool; label: string; icon: LucideIcon }[] = [
  { id: "add", label: "Add", icon: Plus },
  { id: "select", label: "Select", icon: MousePointer2 },
];

type LeftToolbarProps = {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  onReflect: () => void;
};

export function LeftToolbar({ tool, onToolChange, onReflect }: LeftToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Canvas tools">
      {TOOLS.map(({ id, label, icon: Icon }) => {
        const selected = tool === id;
        return (
          <button
            key={id}
            type="button"
            className="toolbar__button"
            aria-label={label}
            title={label}
            aria-pressed={selected}
            onClick={() => {
              // Cursor/Select toggles off back to Add when pressed again.
              if (selected && id === "select") {
                onToolChange("add");
                return;
              }
              onToolChange(id);
            }}
          >
            <Icon size={18} strokeWidth={2.25} />
          </button>
        );
      })}
      <button
        type="button"
        className="toolbar__button toolbar__button--action"
        aria-label="Reflect on your process"
        title="Reflect on your process"
        onClick={onReflect}
      >
        <Sparkles size={18} strokeWidth={2.25} />
      </button>
    </div>
  );
}
