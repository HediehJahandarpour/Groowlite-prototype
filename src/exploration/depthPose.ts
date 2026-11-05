/**
 * Depth motion for the immersive token explorer.
 * Scroll progress is a continuous layer index. One unit promotes the next
 * ranked group. Wheel distance per unit is IMMERSIVE_SCROLL.wheelGain.
 *
 * At an integer progress the three visible groups rest like this:
 *   depth 0 — primary, inner radius, apparent ~130px (primaryScale)
 *   depth 1 — secondary, middle radius (~2× inner), apparent ~100px
 *   depth 2 — tertiary, outer radius, apparent ~90px
 * Every other group is fully hidden. Opacity is only used while a group
 * is entering or leaving that trio.
 *
 * Between integers the nearer outer group comes forward in Z. Perspective
 * enlarges it while its on-screen radius holds, then it eases inward.
 * The previous primary exits. The far ring steps in to fill the gap.
 *
 * Scales are fractions of the explorer base token (130px).
 * Spreads are fractions of the layout reach; middleSpread ≈ 2 × innerSpread.
 */
export const IMMERSIVE_DEPTH = {
  perspective: 1200,
  primaryScale: 1,
  secondaryScale: 100 / 130,
  tertiaryScale: 90 / 130,
  primaryOpacity: 1,
  secondaryOpacity: 1,
  tertiaryOpacity: 1,
  primaryZ: 28,
  secondaryZ: -18,
  tertiaryZ: -64,
  approachLift: 220,
  exitZ: -620,
  enterZ: -160,
  // Middle ≈ 1.75× inner; outer far enough for 130 / 100 / 90 without
  // crushing reach on shorter viewports. Inner sits further out so the
  // hub search/filters clear the first ring.
  innerSpread: 1.22,
  middleSpread: 2.14,
  outerSpread: 2.78,
  exitSpread: 0.85,
  enterSpread: 2.78,
  promoteSpreadDelay: 0.36,
  exitOpaque: -0.12,
  exitGone: -0.38,
  /** Tertiary is fully opaque at or below this depth. */
  enterOpaque: 2.12,
  enterHidden: 2.52,
  /** Painted opacity at or above this can be clicked. */
  interactiveOpacity: 0.88,
  maxZ: 460,
  minZ: -1400,
  /**
   * Extra scroll past the last activity group so that layer can exit
   * inward and disappear (same exit path as earlier groups).
   */
  exitOvershoot: 1,
} as const;

export type DepthPose = {
  z: number;
  /** Multiplier applied on top of perspective scaling. */
  scale: number;
  opacity: number;
  spread: number;
  tiltScale: number;
  interactive: boolean;
  zIndex: number;
};

export type CandidatePoint = {
  group: number;
  x: number;
  y: number;
  tiltX: number;
  tiltY: number;
  presence: number;
};

export type ProjectedCandidate = {
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  rotateX: number;
  rotateY: number;
  zIndex: number;
  interactive: boolean;
  transform: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 0 at `from`, 1 at `to`. */
function unit(value: number, from: number, to: number) {
  if (to === from) return 0;
  return clamp((value - from) / (to - from), 0, 1);
}

function perspectiveFactor(z: number) {
  const denominator = IMMERSIVE_DEPTH.perspective - z;
  if (denominator === 0) return 1;
  return IMMERSIVE_DEPTH.perspective / denominator;
}

/** CSS scale whose on-screen size is `apparent` when the token sits at `z`. */
function cssForApparent(apparent: number, z: number) {
  const factor = perspectiveFactor(z);
  if (factor === 0) return apparent;
  return apparent / factor;
}

export function clampProgress(progress: number, groupCount: number): number {
  if (groupCount <= 0) return 0;
  // groupCount here is maxProgress + 1 from useImmersiveScroll (ceiling + 1).
  return clamp(progress, 0, Math.max(0, groupCount - 1));
}

/** Scroll distance that promotes every activity group, without the exit overshoot. */
export function activityScrollSpan(groupCount: number): number {
  return Math.max(0, groupCount - 1);
}

/**
 * Full scroll range including room for the last activity ring to exit inward.
 * Phase-only / checkpoint pickers keep span-only range (no exit overshoot).
 */
export function activityScrollMax(
  groupCount: number,
  allowExit = true,
): number {
  const span = activityScrollSpan(groupCount);
  if (!allowExit || groupCount <= 0) return span;
  return span + IMMERSIVE_DEPTH.exitOvershoot;
}

export function depthOf(groupIndex: number, progress: number): number {
  return groupIndex - progress;
}

function zAt(depth: number): number {
  const d = IMMERSIVE_DEPTH;
  let z: number;
  if (depth <= 0) {
    z = lerp(d.primaryZ, d.exitZ, smoothstep(unit(depth, 0, d.exitGone)));
  } else if (depth < 1) {
    const travel = 1 - depth;
    const base = lerp(d.secondaryZ, d.primaryZ, smoothstep(travel));
    const lift = Math.sin(Math.PI * travel) ** 2 * d.approachLift;
    z = base + lift;
  } else if (depth < 2) {
    const travel = 2 - depth;
    const base = lerp(d.tertiaryZ, d.secondaryZ, smoothstep(travel));
    const lift = Math.sin(Math.PI * travel) ** 2 * d.approachLift * 0.55;
    z = base + lift;
  } else {
    z = lerp(d.tertiaryZ, d.enterZ, smoothstep(unit(depth, 2, d.enterHidden)));
  }
  return clamp(z, d.minZ, d.maxZ);
}

function scaleAt(depth: number): number {
  const d = IMMERSIVE_DEPTH;
  const primaryCss = cssForApparent(d.primaryScale, d.primaryZ);
  const secondaryCss = cssForApparent(d.secondaryScale, d.secondaryZ);
  const tertiaryCss = cssForApparent(d.tertiaryScale, d.tertiaryZ);
  const exitCss = cssForApparent(d.secondaryScale * 0.68, d.exitZ);
  const enterCss = cssForApparent(d.tertiaryScale * 0.92, d.enterZ);
  if (depth <= 0) {
    return lerp(primaryCss, exitCss, smoothstep(unit(depth, 0, d.exitGone)));
  }
  if (depth < 1) {
    return lerp(secondaryCss, primaryCss, smoothstep(1 - depth));
  }
  if (depth < 2) {
    return lerp(tertiaryCss, secondaryCss, smoothstep(2 - depth));
  }
  return lerp(tertiaryCss, enterCss, smoothstep(unit(depth, 2, d.enterHidden)));
}

function spreadAt(depth: number): number {
  const d = IMMERSIVE_DEPTH;
  if (depth <= 0) {
    return lerp(d.innerSpread, d.exitSpread, smoothstep(unit(depth, 0, d.exitGone)));
  }
  if (depth < 1) {
    const travel = 1 - depth;
    const held =
      d.middleSpread *
      (perspectiveFactor(d.secondaryZ) / perspectiveFactor(zAt(depth)));
    const inward = smoothstep(unit(travel, d.promoteSpreadDelay, 1));
    return lerp(held, d.innerSpread, inward);
  }
  if (depth < 2) {
    const travel = 2 - depth;
    const held =
      d.outerSpread *
      (perspectiveFactor(d.tertiaryZ) / perspectiveFactor(zAt(depth)));
    const inward = smoothstep(unit(travel, d.promoteSpreadDelay, 1));
    return lerp(held, d.middleSpread, inward);
  }
  return lerp(d.outerSpread, d.enterSpread, smoothstep(unit(depth, 2, d.enterHidden)));
}

function opacityAt(depth: number): number {
  const d = IMMERSIVE_DEPTH;
  if (depth <= d.exitGone || depth >= d.enterHidden) return 0;
  if (depth < d.exitOpaque) {
    return smoothstep(unit(depth, d.exitGone, d.exitOpaque)) * d.primaryOpacity;
  }
  if (depth > d.enterOpaque) {
    return smoothstep(unit(depth, d.enterHidden, d.enterOpaque)) * d.tertiaryOpacity;
  }
  if (depth <= 0) return d.primaryOpacity;
  if (depth <= 1) return d.secondaryOpacity;
  if (depth <= 2) return d.tertiaryOpacity;
  return d.tertiaryOpacity;
}

export function poseAtDepth(depth: number): DepthPose {
  const z = zAt(depth);
  const scale = scaleAt(depth);
  const opacity = opacityAt(depth);
  const spread = spreadAt(depth);
  const interactive = opacity >= IMMERSIVE_DEPTH.interactiveOpacity;
  const tiltScale = opacity > 0.95 ? 1 : lerp(0.25, 1, opacity);
  return {
    z,
    scale,
    opacity,
    spread,
    tiltScale,
    interactive,
    zIndex: Math.round(160 + z / 8),
  };
}

/** Approximate on-screen size after CSS perspective, for tests and tuning. */
export function apparentScale(depth: number): number {
  const pose = poseAtDepth(depth);
  const denominator = IMMERSIVE_DEPTH.perspective - pose.z;
  if (denominator === 0) return pose.scale;
  return pose.scale * (IMMERSIVE_DEPTH.perspective / denominator);
}

export function projectCandidate(
  item: CandidatePoint,
  progress: number,
  reachX: number,
  reachY: number,
): ProjectedCandidate {
  const pose = poseAtDepth(depthOf(item.group, progress));
  const x = item.x * reachX * pose.spread;
  const y = item.y * reachY * pose.spread;
  const scale = pose.scale * item.presence;
  const rotateX = item.tiltX * pose.tiltScale;
  const rotateY = item.tiltY * pose.tiltScale;
  return {
    x,
    y,
    z: pose.z,
    scale,
    opacity: pose.opacity,
    rotateX,
    rotateY,
    zIndex: pose.zIndex,
    interactive: pose.interactive,
    transform: [
      "translate(-50%, -50%)",
      `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${pose.z.toFixed(2)}px)`,
      `rotateX(${rotateX.toFixed(2)}deg)`,
      `rotateY(${rotateY.toFixed(2)}deg)`,
      `scale(${scale.toFixed(3)})`,
    ].join(" "),
  };
}
