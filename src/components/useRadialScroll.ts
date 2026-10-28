import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ACTIVITY_SCROLL } from "../process/activityMotion";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Turns wheel movement into a progress value across the outer activity rings.
 * The rings glide toward the target each frame, so a trackpad scrubs and a
 * wheel notch eases through a layer instead of jumping.
 */
export function useRadialScroll(max: number, active: boolean, resetKey = "") {
  const [progress, setProgress] = useState(0);
  const shown = useRef(0);
  const target = useRef(0);
  const maxRef = useRef(max);
  maxRef.current = max;

  // Reset before paint when the selector opens, closes, or the ranked set changes.
  // An effect would leave one frame on the previous ring.
  const generation = `${active ? "open" : "closed"}|${resetKey}`;
  const seenGeneration = useRef(generation);
  if (seenGeneration.current !== generation) {
    seenGeneration.current = generation;
    shown.current = 0;
    target.current = 0;
    if (progress !== 0) setProgress(0);
  }

  useEffect(() => {
    if (!active) return;

    const tick = () => {
      const ceiling = Math.max(0, maxRef.current);
      target.current = clamp(target.current, 0, ceiling);
      const dest = target.current;
      const diff = dest - shown.current;
      if (Math.abs(diff) < 0.001) {
        if (shown.current !== dest) {
          shown.current = dest;
          setProgress(dest);
        }
        return;
      }
      shown.current += diff * ACTIVITY_SCROLL.follow;
      setProgress(shown.current);
    };

    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [active]);

  const nudge = useCallback((deltaY: number) => {
    const step = clamp(deltaY * ACTIVITY_SCROLL.wheelGain, -ACTIVITY_SCROLL.maxStep, ACTIVITY_SCROLL.maxStep);
    const ceiling = Math.max(0, maxRef.current);
    const next = clamp(target.current + step, 0, ceiling);
    target.current = clamp(next, shown.current - ACTIVITY_SCROLL.lead, shown.current + ACTIVITY_SCROLL.lead);
    if (reducedMotion()) {
      shown.current = target.current;
      setProgress(target.current);
    }
  }, []);

  return { progress, nudge };
}
