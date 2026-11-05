import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { useEffect, useRef, useState } from "react";
import { gridStyle, worldTransform, type CanvasView } from "../canvas/view";
import { normalizeRect, type ScreenRect } from "../process/multiSelect";
import "./Canvas.css";
import "./MultiTokenChrome.css";

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
  /**
   * When true (Select tool), empty-canvas drag draws a selection rectangle.
   * When false, empty-canvas drag pans. Space + drag also pans in either mode.
   */
  boxSelectEnabled?: boolean;
  /** Live preview of tokens under the drag rectangle. */
  onBoxSelectMove?: (rect: ScreenRect | null, additive: boolean) => void;
  /** Commit the drag rectangle. Null means the gesture stayed a click. */
  onBoxSelectEnd?: (rect: ScreenRect | null, additive: boolean) => void;
  /** SVG process tokens, in world coordinates, can be passed here later. */
  children?: ReactNode;
  /** Blocks pan and zoom while the exploration camera owns the view. */
  locked?: boolean;
  /** 0–1 opacity of the existing glass atmosphere, behind the process. */
  atmosphere?: number;
  atmosphereRef?: (node: HTMLDivElement | null) => void;
};

const BOX_THRESHOLD_PX = 4;

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
  boxSelectEnabled = false,
  onBoxSelectMove,
  onBoxSelectEnd,
  children,
  locked = false,
  atmosphere = 0,
  atmosphereRef,
}: CanvasProps) {
  const [spaceDown, setSpaceDown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [boxRect, setBoxRect] = useState<ScreenRect | null>(null);
  const spaceRef = useRef(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const gestureRef = useRef<{
    x: number;
    y: number;
    localX: number;
    localY: number;
    background: boolean;
    mode: "pan" | "box";
    additive: boolean;
    boxing: boolean;
  } | null>(null);
  const lockedRef = useRef(locked);
  const boxSelectRef = useRef(boxSelectEnabled);
  const onBoxSelectMoveRef = useRef(onBoxSelectMove);
  const onBoxSelectEndRef = useRef(onBoxSelectEnd);
  lockedRef.current = locked;
  boxSelectRef.current = boxSelectEnabled;
  onBoxSelectMoveRef.current = onBoxSelectMove;
  onBoxSelectEndRef.current = onBoxSelectEnd;

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
      if (lockedRef.current) return;
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
    if (locked || event.button !== 0) return;
    const target = event.target;
    const startedOnControl =
      target instanceof Element &&
      Boolean(
        target.closest(
          "button, a, input, textarea, .activity-filter, .process-token, .token-toolbar, .multi-toolbar, .multi-selection, .token-grip",
        ),
      );
    if (startedOnControl) return;

    const point = localPoint(event.currentTarget, event.clientX, event.clientY);
    const wantBox =
      boxSelectRef.current && !spaceRef.current && event.target === event.currentTarget;
    gestureRef.current = {
      x: event.clientX,
      y: event.clientY,
      localX: point.x,
      localY: point.y,
      background: event.target === event.currentTarget,
      mode: wantBox ? "box" : "pan",
      additive: event.shiftKey,
      boxing: false,
    };
    dragRef.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
    setBoxRect(null);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture needs a real pointer. Drag still tracks move events.
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const gesture = gestureRef.current;
    if (!drag || !gesture) return;

    if (gesture.mode === "box") {
      const moved = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
      if (!gesture.boxing && moved < BOX_THRESHOLD_PX) return;
      const point = localPoint(event.currentTarget, event.clientX, event.clientY);
      const rect = normalizeRect(gesture.localX, gesture.localY, point.x, point.y);
      gesture.boxing = true;
      setBoxRect(rect);
      onBoxSelectMoveRef.current?.(rect, gesture.additive);
      return;
    }

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
    setBoxRect(null);

    if (gesture?.mode === "box") {
      if (gesture.boxing) {
        const point = localPoint(event.currentTarget, event.clientX, event.clientY);
        const rect = normalizeRect(gesture.localX, gesture.localY, point.x, point.y);
        onBoxSelectMoveRef.current?.(null, false);
        onBoxSelectEndRef.current?.(rect, gesture.additive);
      } else if (gesture.background && onBackgroundClick) {
        onBoxSelectMoveRef.current?.(null, false);
        onBoxSelectEndRef.current?.(null, false);
        onBackgroundClick();
      } else {
        onBoxSelectMoveRef.current?.(null, false);
      }
    } else if (gesture?.background && onBackgroundClick) {
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

  const panCursor = !locked && (!boxSelectEnabled || spaceDown);
  const className = [
    "canvas",
    locked ? "canvas--locked" : "",
    panCursor ? "canvas--pan-ready" : "",
    !locked && boxSelectEnabled && !spaceDown ? "canvas--select-ready" : "",
    dragging && !boxRect ? "canvas--panning" : "",
    boxRect ? "canvas--boxing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={viewportRef}
      className={className}
      role="region"
      aria-label="Process canvas"
      style={{ ["--atmosphere" as string]: atmosphere }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        ref={atmosphereRef}
        className="canvas__atmosphere explorer-glass"
        style={{ ["--atmosphere" as string]: atmosphere }}
      />
      <div className="canvas__grid" style={gridStyle(view)} />
      <div
        className="canvas__world"
        style={{ transform: worldTransform(view) }}
      >
        <div className="canvas__tokens">{children}</div>
      </div>
      {boxRect ? (
        <div
          className="box-select-rect"
          style={{
            left: boxRect.x,
            top: boxRect.y,
            width: boxRect.width,
            height: boxRect.height,
          }}
        />
      ) : null}
    </div>
  );
}
