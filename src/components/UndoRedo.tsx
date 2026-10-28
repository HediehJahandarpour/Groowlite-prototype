import { Redo2, Undo2 } from "lucide-react";
import "./UndoRedo.css";

export function UndoRedo() {
  return (
    <div className="history" aria-label="History">
      <button type="button" className="history__button" aria-label="Undo" disabled>
        <Undo2 size={20} strokeWidth={2} />
      </button>
      <button type="button" className="history__button" aria-label="Redo" disabled>
        <Redo2 size={20} strokeWidth={2} />
      </button>
    </div>
  );
}
