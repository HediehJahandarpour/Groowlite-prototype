import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { useEffect, useRef, useState } from "react";
import { gridStyle, worldTransform, type CanvasView } from "../canvas/view";
import "./Canvas.css";

type CanvasProps = {
  viewportRef: RefObject<HTMLDivElement | null>;
  view: CanvasView;
  onPanBy: (dx: number, dy: number) => void;
  onZoomBy: (
    factor: number,
    localX: number,
    localY: number,
    immediate?: boolean,
  ) => void;
  /** A click on empty canvas, after a press that did not pan. */
  onBackgroundClick?: () => void;
  /** SVG process tokens, in world coordinates, can be passed here later. */
  children?: ReactNode;
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function localPoint(
  viewport: HTMLDivElement,
  clientX: number,
  clientY: number,
) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

export function Canvas({
  viewportRef,
  view,
  onPanBy,
  onZoomBy,
  onBackgroundClick,
  children,
}: CanvasProps) {
  const [spaceDown, setSpaceDown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const spaceRef = useRef(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const gestureRef = useRef<{ x: number; y: number; background: boolean } | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || isTypingTarget(event.target)) return;
      if (
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("button, a")
        )
      ) {
        event.preventDefault();
      }
      if (event.repeat || spaceRef.current) return;
      spaceRef.current = true;
      setSpaceDown(true);
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      spaceRef.current = false;
      setSpaceDown(false);
    }

    function clearSpace() {
      spaceRef.current = false;
      setSpaceDown(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearSpace);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function onWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();

      const point = localPoint(viewport!, event.clientX, event.clientY);
      const pixelDelta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * viewport!.clientHeight
            : event.deltaY;
      const factor = Math.exp(-pixelDelta * 0.0015);
      // Pixel deltas are a trackpad pinch, including a fast one that arrives
      // as one large event. Apply those directly. Line and page notches ease.
      const tracksFinger = event.deltaMode === 0;
      onZoomBy(factor, point.x, point.y, tracksFinger);
    }

    function preventPagePinch(event: Event) {
      event.preventDefault();
    }

    viewport.addEventListener("wheel", onWheel, { passive: false });
    // Safari pinch also fires gesture events. The wheel stream above is the
    // zoom; these only stop the browser from zooming the page as well.
    viewport.addEventListener("gesturestart", preventPagePinch, { passive: false });
    viewport.addEventListener("gesturechange", preventPagePinch, { passive: false });
    viewport.addEventListener("gestureend", preventPagePinch);

    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("gesturestart", preventPagePinch);
      viewport.removeEventListener("gesturechange", preventPagePinch);
      viewport.removeEventListener("gestureend", preventPagePinch);
    };
  }, [onZoomBy, viewportRef]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target;
    const startedOnControl =
      target instanceof Element &&
      Boolean(
        target.closest(
          "button, a, input, textarea, .activity-filter, .process-token, .token-toolbar",
        ),
      );
    if (startedOnControl) return;

    gestureRef.current = {
      x: event.clientX,
      y: event.clientY,
      background: event.target === event.currentTarget,
    };
    dragRef.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture needs a real pointer. Drag still tracks move events.
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    if (dx !== 0 || dy !== 0) onPanBy(dx, dy);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!dragRef.current) return;
    dragRef.current = null;
    gestureRef.current = null;
    setDragging(false);
    if (gesture?.background && onBackgroundClick) {
      const moved = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
      if (moved < 5) onBackgroundClick();
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Already released.
    }
  }

  const className = [
    "canvas",
    spaceDown ? "canvas--pan-ready" : "",
    dragging ? "canvas--panning" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={viewportRef}
      className={className}
      role="region"
      aria-label="Process canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="canvas__grid" style={gridStyle(view)} />
      <div
        className="canvas__world"
        style={{ transform: worldTransform(view) }}
      >
        <div className="canvas__tokens">{children}</div>
      </div>
    </div>
  );
}
