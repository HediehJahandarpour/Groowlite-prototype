import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { clampZoom, INITIAL_VIEW, zoomAtPoint, type CanvasView } from "./view";

/**
 * Pan and zoom only. Process data stays outside this hook so a later
 * token layer can render in world space without sharing edit history.
 *
 * Pan follows the pointer. A trackpad pinch is applied on the next frame
 * so the canvas stays with the fingers. Button and mouse-wheel zoom ease
 * in log space, and the world point under the cursor stays fixed.
 */

/** Seconds to close ~63% of a button or mouse-wheel zoom. */
const ZOOM_TAU = 0.09;
/** Remaining ratio small enough to snap an eased zoom. About 0.15%. */
const ZOOM_EPSILON = 0.0015;

type ZoomTarget = {
  scale: number;
  x: number;
  y: number;
  /** Pinch lands in one frame. Eased zoom glides toward this scale. */
  immediate: boolean;
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useCanvasView() {
  const [view, setView] = useState<CanvasView>(INITIAL_VIEW);
  const viewRef = useRef(view);
  const targetRef = useRef<ZoomTarget | null>(null);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const flightRef = useRef<gsap.core.Tween | null>(null);

  const commit = useCallback((next: CanvasView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const stopZoom = useCallback(() => {
    targetRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    lastTimeRef.current = 0;
  }, []);

  const step = useCallback(
    (now: number) => {
      const target = targetRef.current;
      if (!target) {
        rafRef.current = 0;
        return;
      }

      if (target.immediate) {
        targetRef.current = null;
        rafRef.current = 0;
        lastTimeRef.current = 0;
        commit(zoomAtPoint(viewRef.current, target.x, target.y, target.scale));
        return;
      }

      const dt =
        lastTimeRef.current === 0
          ? 1 / 60
          : Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const current = viewRef.current;
      const blend = 1 - Math.exp(-dt / ZOOM_TAU);
      const nextLog =
        Math.log(current.scale) +
        (Math.log(target.scale) - Math.log(current.scale)) * blend;
      let scale = Math.exp(nextLog);

      if (Math.abs(Math.log(target.scale) - nextLog) < ZOOM_EPSILON) {
        scale = target.scale;
        targetRef.current = null;
      }

      commit(zoomAtPoint(current, target.x, target.y, scale));

      if (targetRef.current) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = 0;
        lastTimeRef.current = 0;
      }
    },
    [commit],
  );

  const aimZoom = useCallback(
    (scale: number, localX: number, localY: number, immediate: boolean) => {
      const nextScale = clampZoom(scale);
      const current = viewRef.current;
      const pending = targetRef.current;

      if (immediate) {
        targetRef.current = { scale: nextScale, x: localX, y: localY, immediate: true };
        if (rafRef.current === 0) {
          lastTimeRef.current = 0;
          rafRef.current = requestAnimationFrame(step);
        }
        return;
      }

      const arrived = Math.abs(Math.log(nextScale) - Math.log(current.scale)) < ZOOM_EPSILON;
      const pendingMatches =
        !pending || Math.abs(Math.log(pending.scale) - Math.log(nextScale)) < ZOOM_EPSILON;
      if (arrived && pendingMatches) return;

      if (prefersReducedMotion()) {
        stopZoom();
        commit(zoomAtPoint(viewRef.current, localX, localY, nextScale));
        return;
      }

      targetRef.current = { scale: nextScale, x: localX, y: localY, immediate: false };
      if (rafRef.current === 0) {
        lastTimeRef.current = 0;
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [commit, step, stopZoom],
  );

  const stopFlight = useCallback(() => {
    flightRef.current?.kill();
    flightRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopZoom();
      stopFlight();
    };
  }, [stopFlight, stopZoom]);

  const flyTo = useCallback(
    (
      next: CanvasView,
      duration: number,
      onProgress?: (progress: number) => void,
    ) => {
      stopZoom();
      stopFlight();
      const from = viewRef.current;
      const to = {
        x: next.x,
        y: next.y,
        scale: clampZoom(next.scale),
      };
      if (duration <= 0 || prefersReducedMotion()) {
        commit(to);
        onProgress?.(1);
        return;
      }
      const proxy = { t: 0 };
      const fromLog = Math.log(from.scale);
      const toLog = Math.log(to.scale);
      flightRef.current = gsap.to(proxy, {
        t: 1,
        duration,
        ease: "power2.inOut",
        onUpdate: () => {
          const t = proxy.t;
          commit({
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
            scale: Math.exp(fromLog + (toLog - fromLog) * t),
          });
          onProgress?.(t);
        },
        onComplete: () => {
          flightRef.current = null;
          commit(to);
          onProgress?.(1);
        },
      });
    },
    [commit, stopFlight, stopZoom],
  );

  const getView = useCallback(() => viewRef.current, []);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const current = viewRef.current;
      commit({
        ...current,
        x: current.x + dx,
        y: current.y + dy,
      });
    },
    [commit],
  );

  const zoomBy = useCallback(
    (factor: number, localX: number, localY: number, immediate = false) => {
      const pending = targetRef.current;
      // A pinch stacks on the scale already queued this frame. It starts
      // from the scale on screen when a button ease is still in flight.
      const base =
        immediate && !pending?.immediate
          ? viewRef.current.scale
          : (pending?.scale ?? viewRef.current.scale);
      aimZoom(base * factor, localX, localY, immediate);
    },
    [aimZoom],
  );

  const zoomTo = useCallback(
    (scale: number, localX: number, localY: number, immediate = false) => {
      aimZoom(scale, localX, localY, immediate);
    },
    [aimZoom],
  );

  const zoomByPercent = useCallback(
    (deltaPercent: number, localX: number, localY: number) => {
      const base = targetRef.current?.scale ?? viewRef.current.scale;
      const nextPercent = Math.round(base * 100) + deltaPercent;
      aimZoom(nextPercent / 100, localX, localY, false);
    },
    [aimZoom],
  );

  const resetZoom = useCallback(
    (localX: number, localY: number) => {
      aimZoom(1, localX, localY, false);
    },
    [aimZoom],
  );

  const adjustView = useCallback(
    (update: (view: CanvasView) => CanvasView) => {
      stopZoom();
      commit(update(viewRef.current));
    },
    [commit, stopZoom],
  );

  return {
    view,
    panBy,
    zoomBy,
    zoomTo,
    zoomByPercent,
    resetZoom,
    adjustView,
    flyTo,
    getView,
  };
}
