/**
 * Ambient motion for the immersive explorer.
 * Depth scrolling still owns each token button's transform.
 * These values only add a separate idle float, a one-time opening
 * teaser, gradient breathing, and the scroll hint.
 *
 * idle — gentle float on the inner token art while scroll is resting
 * teaser — one forward nudge of the nearest groups after the camera arrives
 * breath — scale and opacity of the whole gradient plate
 * hint — the fixed scroll invitation
 */
import { IMMERSIVE_DEPTH } from "./depthPose";

export const EXPLORER_MOTION = {
  idle: {
    enabled: true,
    /** Vertical travel, in px. Each token picks a value in this range. */
    minY: 12,
    maxY: 20,
    /** Horizontal travel, in px, kept smaller than the vertical float. */
    maxX: 6,
    /** Rotation on X and Y, in degrees. */
    maxRotate: 4,
    minDuration: 2.8,
    maxDuration: 4.4,
    /** Wait after scrolling stops before the float returns. */
    resumeDelay: 0.48,
    /** Ease the float back to rest when scrolling begins. */
    settleDuration: 0.3,
    /** Stagger used when the float restarts, so tokens do not move together. */
    resumeSpread: 0.62,
    /** Painted opacity above which a resting token may float. */
    showAbove: 0.2,
    /** Painted opacity below which a floating token returns to rest. */
    hideBelow: 0.12,
  },
  teaser: {
    enabled: true,
    /** Full forward-and-back duration, in seconds. */
    duration: 1.3,
    /** Ease back to the scroll pose when the user takes over. */
    cancelDuration: 0.18,
    /** Extra Z toward the camera for the nearest group, in px. */
    forwardZ: 46,
    /**
     * Extra scale on the nearest group at the peak.
     * Together with forwardZ this is about a 12% projected size increase.
     */
    scaleGain: 0.074,
    /** Depth window, relative to scroll progress, treated as the nearest group. */
    nearMin: -0.2,
    nearMax: 0.45,
    /** Deeper than this, a group is left untouched. */
    nextDepth: 1.2,
    /** Share of the nearest-group move given to the next group. */
    nextShare: 0.36,
    nextScaleGain: 0.025,
    /** Added opacity for the next group at the peak. */
    nextOpacity: 0.12,
    /** The next group stays dimmer than the tokens the user can choose. */
    nextOpacityCap: 0.62,
    /** Tokens already this faint are not revealed by the teaser. */
    opacityFloor: 0.1,
  },
  breath: {
    enabled: true,
    minScale: 1,
    maxScale: 1.08,
    minOpacity: 0.72,
    maxOpacity: 1,
    /** Seconds for one half of the cycle. The return takes the same time. */
    duration: 2.6,
  },
  hint: {
    enabled: true,
    /** Vertical bob of the scroll icon, in px. */
    travel: 4,
    duration: 1.5,
  },
} as const;

export type IdleMotion = {
  x: number;
  y: number;
  rotationX: number;
  rotationY: number;
  duration: number;
  /** 0–1 position inside the float cycle. */
  phase: number;
};

export type TeaserPose = {
  z: number;
  scale: number;
  opacity: number;
};

function unit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function mix(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Stable per token. The same id always returns the same float. */
export function idleMotionFor(
  id: string,
  rank: number,
  group: number,
): IdleMotion {
  const key = `${id}|${rank}|${group}`;
  const { idle } = EXPLORER_MOTION;
  const vertical = mix(idle.minY, idle.maxY, unit(`${key}|y`));
  return {
    y: unit(`${key}|dir`) < 0.5 ? -vertical : vertical,
    x: (unit(`${key}|x`) * 2 - 1) * idle.maxX,
    rotationX: (unit(`${key}|rx`) * 2 - 1) * idle.maxRotate,
    rotationY: (unit(`${key}|ry`) * 2 - 1) * idle.maxRotate,
    duration: mix(idle.minDuration, idle.maxDuration, unit(`${key}|t`)),
    phase: unit(`${key}|p`),
  };
}

/**
 * Temporary depth offset drawn on top of the scroll pose.
 * Amount 0 leaves the pose unchanged. Scroll progress is not an input
 * that this function writes; callers keep the real progress where it is.
 */
export function applyOpeningTeaser(
  group: number,
  progress: number,
  amount: number,
  base: TeaserPose,
): TeaserPose {
  if (amount <= 0) return base;
  const depth = group - progress;
  const { teaser } = EXPLORER_MOTION;
  const near = depth >= teaser.nearMin && depth <= teaser.nearMax;
  const next = depth > teaser.nearMax && depth <= teaser.nextDepth;
  if ((!near && !next) || base.opacity < teaser.opacityFloor) return base;
  if (near) {
    return {
      z: Math.min(IMMERSIVE_DEPTH.maxZ, base.z + teaser.forwardZ * amount),
      scale: base.scale * (1 + teaser.scaleGain * amount),
      opacity: base.opacity,
    };
  }
  return {
    z: Math.min(
      IMMERSIVE_DEPTH.maxZ,
      base.z + teaser.forwardZ * teaser.nextShare * amount,
    ),
    scale: base.scale * (1 + teaser.nextScaleGain * amount),
    opacity: Math.min(
      teaser.nextOpacityCap,
      base.opacity + teaser.nextOpacity * amount,
    ),
  };
}

export function depthTransform(parts: {
  x: number;
  y: number;
  z: number;
  rotateX: number;
  rotateY: number;
  scale: number;
}): string {
  return [
    "translate(-50%, -50%)",
    `translate3d(${parts.x.toFixed(2)}px, ${parts.y.toFixed(2)}px, ${parts.z.toFixed(2)}px)`,
    `rotateX(${parts.rotateX.toFixed(2)}deg)`,
    `rotateY(${parts.rotateY.toFixed(2)}deg)`,
    `scale(${parts.scale.toFixed(3)})`,
  ].join(" ");
}

/** On-screen size after perspective, matching depthPose.apparentScale. */
export function projectedSize(scale: number, z: number): number {
  const denominator = IMMERSIVE_DEPTH.perspective - z;
  if (denominator === 0) return scale;
  return scale * (IMMERSIVE_DEPTH.perspective / denominator);
}
