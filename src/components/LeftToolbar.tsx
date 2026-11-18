import { Plus, Sparkles } from "lucide-react";
import "./LeftToolbar.css";

type LeftToolbarProps = {
  onReflect: () => void;
};

/**
 * Process tools stay available without a Select mode.
 * Click a token or drag a marquee to select; scroll the trackpad to pan.
 */
export function LeftToolbar({ onReflect }: LeftToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Canvas tools">
      <button
        type="button"
        className="toolbar__button"
        aria-label="Add"
        title="Add tokens with the blue plus on the process"
        aria-pressed="true"
      >
        <Plus size={18} strokeWidth={2.25} />
      </button>
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
