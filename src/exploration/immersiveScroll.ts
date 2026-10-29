import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { clampProgress } from "./depthPose";

/**
 * Wheel feel for exploration.
 * maxStep caps one wheel event so a notch cannot skip a whole group.
 * lead stops a fast flick from queuing more than about one group ahead.
 * wheelGain converts pixels of wheel travel into group progress.
 * follow is the share of the remaining distance closed on each animation frame.
 */
export const IMMERSIVE_SCROLL = {
  maxStep: 0.28,
  lead: 0.95,
  wheelGain: 0.0017,
  follow: 0.16,
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Continuous progress across recommendation groups.
 * The value lives outside React state. Subscribers paint transforms directly.
 */
export function useImmersiveScroll(
  max: number,
  active: boolean,
  resetKey = "",
) {
  const shown = useRef(0);
  const target = useRef(0);
  const maxRef = useRef(max);
  maxRef.current = max;
  const listeners = useRef(new Set<(value: number) => void>());

  const generation = `${active ? "open" : "closed"}|${resetKey}|${max}`;
  const seenGeneration = useRef(generation);
  if (seenGeneration.current !== generation) {
    seenGeneration.current = generation;
    shown.current = 0;
    target.current = 0;
  }

  const publish = useCallback((value: number) => {
    listeners.current.forEach((listener) => listener(value));
  }, []);

  useLayoutEffect(() => {
    publish(shown.current);
  }, [generation, publish]);

  useEffect(() => {
    if (!active) return;

    const tick = () => {
      const ceiling = Math.max(0, maxRef.current);
      target.current = clampProgress(target.current, ceiling + 1);
      const destination = target.current;
      const difference = destination - shown.current;
      if (Math.abs(difference) < 0.0008) {
        if (shown.current !== destination) {
          shown.current = destination;
          publish(destination);
        }
        return;
      }
      shown.current += difference * IMMERSIVE_SCROLL.follow;
      publish(shown.current);
    };

    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
    };
  }, [active, publish]);

  const nudge = useCallback(
    (deltaY: number) => {
      const step = clamp(
        deltaY * IMMERSIVE_SCROLL.wheelGain,
        -IMMERSIVE_SCROLL.maxStep,
        IMMERSIVE_SCROLL.maxStep,
      );
      const ceiling = Math.max(0, maxRef.current);
      const next = clampProgress(target.current + step, ceiling + 1);
      target.current = clamp(
        next,
        shown.current - IMMERSIVE_SCROLL.lead,
        shown.current + IMMERSIVE_SCROLL.lead,
      );
      target.current = clampProgress(target.current, ceiling + 1);
      if (reducedMotion()) {
        shown.current = target.current;
        publish(shown.current);
      }
    },
    [publish],
  );

  const subscribe = useCallback((listener: (value: number) => void) => {
    listeners.current.add(listener);
    listener(shown.current);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const settle = useCallback(() => {
    target.current = shown.current;
  }, []);

  return { nudge, subscribe, settle };
}
