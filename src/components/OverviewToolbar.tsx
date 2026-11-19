import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  OVERVIEW_STAMPS,
  OVERVIEW_TOOLBAR,
  type OverviewStamp,
} from "../process/overviewStamps";
import type { OverviewStampId } from "../process/processTypes";
import "./OverviewToolbar.css";

const DRAG_THRESHOLD_PX = 5;

type OverviewToolbarProps = {
  armedId: OverviewStampId | null;
  onArm: (id: OverviewStampId | null) => void;
  onDragOver: (clientX: number, clientY: number) => void;
  onDrop: (id: OverviewStampId, clientX: number, clientY: number) => void;
  onDragEnd: () => void;
};

type Ghost = {
  stamp: OverviewStamp;
  x: number;
  y: number;
};

/**
 * Centered wooden toolbar for the process overview.
 * Select a piece, or drag it, to set it on a token.
 */
export function OverviewToolbar({
  armedId,
  onArm,
  onDragOver,
  onDrop,
  onDragEnd,
}: OverviewToolbarProps) {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const dragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragRef.current?.();
    };
  }, []);

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, stamp: OverviewStamp) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current?.();

    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    function finish() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.documentElement.classList.remove("is-stamping");
      dragRef.current = null;
    }

    function move(next: PointerEvent) {
      const distance = Math.hypot(next.clientX - startX, next.clientY - startY);
      if (!moved && distance < DRAG_THRESHOLD_PX) return;
      if (!moved) {
        moved = true;
        document.documentElement.classList.add("is-stamping");
      }
      setGhost({ stamp, x: next.clientX, y: next.clientY });
      onDragOver(next.clientX, next.clientY);
    }

    function up(next: PointerEvent) {
      finish();
      setGhost(null);
      if (moved) onDrop(stamp.id, next.clientX, next.clientY);
      else onArm(armedId === stamp.id ? null : stamp.id);
      onDragEnd();
    }

    dragRef.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <div className="overview-toolbar-slot">
      <div
        className="overview-toolbar"
        role="toolbar"
        aria-label="Place on a token"
        style={{ width: OVERVIEW_TOOLBAR.width, height: OVERVIEW_TOOLBAR.height }}
      >
        {OVERVIEW_STAMPS.map((stamp) => (
          <button
            key={stamp.id}
            type="button"
            className="overview-toolbar__item"
            aria-label={stamp.label}
            aria-pressed={armedId === stamp.id}
            title={stamp.label}
            style={{
              left: stamp.x,
              top: stamp.y,
              width: stamp.displayWidth,
              height: stamp.displayHeight,
            }}
            onPointerDown={(event) => beginDrag(event, stamp)}
          >
            <img
              src={`/tokens/${stamp.asset}`}
              alt=""
              width={Math.round(stamp.displayWidth)}
              height={Math.round(stamp.displayHeight)}
              draggable={false}
            />
          </button>
        ))}
      </div>
      {ghost ? (
        <img
          className="overview-toolbar__ghost"
          src={`/tokens/${ghost.stamp.asset}`}
          alt=""
          width={Math.round(ghost.stamp.displayWidth)}
          height={Math.round(ghost.stamp.displayHeight)}
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.stamp.displayWidth,
            height: ghost.stamp.displayHeight,
          }}
          draggable={false}
        />
      ) : null}
    </div>
  );
}
