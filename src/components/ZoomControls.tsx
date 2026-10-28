import { Minus, Plus, RotateCcw } from "lucide-react";
import type { RefObject } from "react";
import { MAX_ZOOM, MIN_ZOOM, zoomPercent } from "../canvas/view";
import "./ZoomControls.css";

type ZoomControlsProps = {
  scale: number;
  viewportRef: RefObject<HTMLDivElement | null>;
  onZoomByPercent: (deltaPercent: number, localX: number, localY: number) => void;
  onResetZoom: (localX: number, localY: number) => void;
};

export function ZoomControls({
  scale,
  viewportRef,
  onZoomByPercent,
  onResetZoom,
}: ZoomControlsProps) {
  const percent = zoomPercent(scale);
  const atMin = percent <= Math.round(MIN_ZOOM * 100);
  const atMax = percent >= Math.round(MAX_ZOOM * 100);
  const atDefault = percent === 100;

  function viewportCenter() {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    return {
      x: viewport.clientWidth / 2,
      y: viewport.clientHeight / 2,
    };
  }

  return (
    <div className="zoom" role="group" aria-label="Zoom">
      <button
        type="button"
        className="zoom__button"
        aria-label="Zoom out"
        disabled={atMin}
        onClick={() => {
          const center = viewportCenter();
          if (!center) return;
          onZoomByPercent(-10, center.x, center.y);
        }}
      >
        <Minus size={16} strokeWidth={2} />
      </button>
      <span className="zoom__value">{percent}%</span>
      <button
        type="button"
        className="zoom__button"
        aria-label="Zoom in"
        disabled={atMax}
        onClick={() => {
          const center = viewportCenter();
          if (!center) return;
          onZoomByPercent(10, center.x, center.y);
        }}
      >
        <Plus size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="zoom__reset"
        aria-label="Reset zoom"
        disabled={atDefault}
        onClick={() => {
          const center = viewportCenter();
          if (!center) return;
          onResetZoom(center.x, center.y);
        }}
      >
        <RotateCcw size={14} strokeWidth={2} />
        Reset
      </button>
    </div>
  );
}
