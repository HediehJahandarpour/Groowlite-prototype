import { MousePointer2, Plus, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./LeftToolbar.css";

export type CanvasTool = "add" | "select" | "explore";

const TOOLS: { id: CanvasTool; label: string; icon: LucideIcon }[] = [
  { id: "add", label: "Add", icon: Plus },
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "explore", label: "Explore", icon: Sparkles },
];

type LeftToolbarProps = {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
};

export function LeftToolbar({ tool, onToolChange }: LeftToolbarProps) {
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
            aria-pressed={selected}
            onClick={() => onToolChange(id)}
          >
            <Icon size={18} strokeWidth={2.25} />
          </button>
        );
      })}
    </div>
  );
}
