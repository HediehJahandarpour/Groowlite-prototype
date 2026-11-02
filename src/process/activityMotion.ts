import type { PhaseId } from "../data/phasePalette";
import {
  GRADIENT_VIEW,
  PLATE_CIRCLES,
  TOKEN_CIRCLES,
  type PlateCircle,
} from "./activityGradient";

/**
 * Scroll feel. One full layer takes `secondsPerLayer`.
 * `wheelGain` is progress added per pixel of wheel movement.
 * `maxStep` stops one wheel event from jumping several layers.
 * `lead` stops a fast flick from queuing more than about one layer ahead.
 */
export const ACTIVITY_SCROLL = {
  /** How far one wheel event can move the target, in layers. */
  maxStep: 1,
  /** How far the target may run ahead of the rings on screen. */
  lead: 1.4,
  wheelGain: 0.009,
  /** Share of the remaining distance closed on each frame. */
  follow: 0.15,
};

type RingStop = {
  /** Layer offset. 0 is the nearest big half circle. The small ring is separate. */
  at: number;
  circle: PlateCircle;
  /** 1 sits on that circle's stroke. */
  radius: number;
  size: number;
  opacity: number;
};

const GRADIENT = 960;
const PLATE_SCALE = GRADIENT / GRADIENT_VIEW;
/** Closest circle. Its centre is the point the rings share with the activity token. */
const FOCUS = TOKEN_CIRCLES[0];
/**
 * Three strokes with a real gap between them.
 * The plate circles meet on the lower left, so nearer pairs would overlap.
 * 0 is the inner ring, 4 the middle, 7 the outer visible ring.
 */
const FIRST = PLATE_CIRCLES[0];
const SECOND = PLATE_CIRCLES[4];
const THIRD = PLATE_CIRCLES[7];

/**
 * At rest only three rings are occupied.
 * The inner ring is fully visible. The next two are half strength.
 * Every later layer waits on the third ring at zero opacity, and fades to
 * half strength as scrolling brings it onto that ring. Reaching the inner
 * ring brings it to full opacity.
 */
export const ACTIVITY_LAYOUT = {
  gradient: GRADIENT,
  center: {
    x: (GRADIENT_VIEW / 2 - FOCUS.cx) * PLATE_SCALE,
    y: (GRADIENT_VIEW / 2 - FOCUS.cy) * PLATE_SCALE,
  },
  endpointClearance: 920,
  /** Half-strength rings stay clickable. Hidden layers do not. */
  hitOpacity: 0.45,
  /** Neighbouring rings sit in each other's gaps. */
  spins: [0, 20, 0, 20, 0, 20, 0, 20],
  stops: [
    { at: -1, circle: FIRST, radius: 1, size: 92, opacity: 0 },
    { at: 0, circle: FIRST, radius: 1, size: 100, opacity: 1 },
    { at: 1, circle: SECOND, radius: 1, size: 76, opacity: 0.5 },
    { at: 2, circle: THIRD, radius: 1, size: 68, opacity: 0.5 },
    { at: 3, circle: THIRD, radius: 1, size: 68, opacity: 0 },
  ] satisfies RingStop[],
};

/** The tokens on the inner ring, fully visible until the first scroll. */
export const FRONT_RING: RingPose = {
  cx: FIRST.cx,
  cy: FIRST.cy,
  r: FIRST.r,
  size: 100,
  opacity: 1,
};

/**
 * Evenly spaced angles on the open side of the radar.
 * The lower-left is left clear: that is where the rings pinch together
 * and where the activities card sits.
 * 0° is right, -90° is up.
 */
export function ringAngles(count: number, spin: number): number[] {
  const start = -120;
  const sweep = 210;
  const step = sweep / count;
  return Array.from(
    { length: count },
    (_, index) => start + spin + step * (index + 0.5),
  );
}

/**
 * Strongest colour of each phase wash. The rings fade from this toward white.
 * Neutral, before any phase is placed, uses the understand colour.
 */
export const PHASE_COLOR: Record<PhaseId | "neutral", string> = {
  neutral: "#7AABCD",
  understand: "#7AABCD",
  discover: "#A5C6A3",
  design: "#EED584",
  make: "#EBAB7F",
  share: "#EEBDC2",
};

export type Rgb = { r: number; g: number; b: number };

export function phaseRgb(phase: PhaseId | null): Rgb {
  const hex = PHASE_COLOR[phase ?? "neutral"].slice(1);
  const value = Number.parseInt(hex, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export type RingPose = {
  cx: number;
  cy: number;
  r: number;
  size: number;
  opacity: number;
};

function poseOf(stop: RingStop): RingPose {
  return {
    cx: stop.circle.cx,
    cy: stop.circle.cy,
    r: stop.circle.r * stop.radius,
    size: stop.size,
    opacity: stop.opacity,
  };
}

function mix(a: RingPose, b: RingPose, t: number): RingPose {
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    r: a.r + (b.r - a.r) * t,
    size: a.size + (b.size - a.size) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t,
  };
}

/** Circle pose for a layer offset. Integer offsets sit exactly on a stroke. */
export function sampleRing(offset: number): RingPose {
  const stops = ACTIVITY_LAYOUT.stops;
  if (offset <= stops[0].at) return poseOf(stops[0]);
  const last = stops[stops.length - 1];
  if (offset >= last.at) return poseOf(last);
  for (let index = 1; index < stops.length; index += 1) {
    const next = stops[index];
    const prev = stops[index - 1];
    if (offset > next.at) continue;
    const span = next.at - prev.at || 1;
    return mix(poseOf(prev), poseOf(next), (offset - prev.at) / span);
  }
  return poseOf(last);
}
