import { useEffect, useId, useRef, useState } from "react";
import "./AddProcessPanel.css";
import "./LeftToolbar.css";

/**
 * The plus beside the project name opens Add process.
 * Click a token or drag a marquee to select; scroll the trackpad to pan.
 */
export function LeftToolbar() {
  const panelId = useId();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (root.contains(event.target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="toolbar-slot" ref={rootRef}>
      <div className="toolbar" role="toolbar" aria-label="Canvas tools">
        <button
          ref={buttonRef}
          type="button"
          className="toolbar__button"
          aria-label="Add process"
          title="Add process"
          aria-expanded={open}
          aria-controls={panelId}
          aria-pressed={open}
          onClick={() => setOpen((current) => !current)}
        >
          <img
            src="/add-process/toolbar-upload.svg"
            alt=""
            width={50}
            height={50}
          />
        </button>
      </div>

      {open ? (
        <div
          id={panelId}
          className="add-process"
          role="dialog"
          aria-labelledby={titleId}
        >
          <div className="add-process__art" aria-hidden="true">
            <div className="add-process__art-frame">
              <img
                className="add-process__art-image"
                alt=""
                src="/add-process/illustration.png"
              />
            </div>
          </div>

          <h2 id={titleId} className="add-process__title">
            Add process
          </h2>

          <div className="add-process__copy">
            <p>Use your camera to scan a printed or handwritten process document.</p>
            <p>Upload an existing process document from your device.</p>
          </div>

          <div className="add-process__actions">
            <button
              type="button"
              className="add-process__action"
              onClick={() => scanRef.current?.click()}
            >
              <img src="/add-process/scan.svg" alt="" width={18} height={18} />
              Scan process
            </button>
            <button
              type="button"
              className="add-process__action"
              onClick={() => uploadRef.current?.click()}
            >
              <img src="/add-process/upload.svg" alt="" width={18} height={18} />
              Upload process
            </button>
          </div>

          <input
            ref={scanRef}
            className="add-process__file"
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            aria-hidden="true"
          />
          <input
            ref={uploadRef}
            className="add-process__file"
            type="file"
            accept="image/*,.pdf,application/pdf"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
      ) : null}
    </div>
  );
}
