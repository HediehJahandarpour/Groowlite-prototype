import { Redo2, Undo2 } from "lucide-react";
import "./UndoRedo.css";

type UndoRedoProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export function UndoRedo({ canUndo, canRedo, onUndo, onRedo }: UndoRedoProps) {
  return (
    <div className="history" aria-label="History">
      <button
        type="button"
        className="history__button"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 size={20} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="history__button"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 size={20} strokeWidth={2} />
      </button>
    </div>
  );
}
