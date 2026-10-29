/**
 * Depth motion for the immersive token explorer.
 * Scroll progress is a continuous layer index. Group 0 is the most relevant
 * set. These values are the tuning controls for the 3D travel:
 *
 * perspective — CSS perspective on the scene, in px
 * originZ — resting Z of the front group, slightly toward the viewer
 * groupSpacing — Z distance between ranked groups
 * frontScale — size of the fully visible, choosable layer
 * farExtraScale / passExtraScale — extra scale on top of perspective.
 *   passExtraScale is the size a token reaches as it leaves the screen.
 * farDepth — depth at which distant tokens reach their smallest extra scale
 * opacityDepth — depth at which distant tokens reach farOpacity.
 *   Opacity rises continuously as scroll brings a group forward.
 * passDepth — how far a group travels toward the camera before it fades out
 * passFadeStart — fraction of that exit before opacity begins to fall,
 *   so tokens can grow while they are still visible
 * spreadFar / spreadPass — how orbital radius tightens or opens with depth
 * interactiveMin / interactiveMax — depth window that can be clicked
 */
export const IMMERSIVE_DEPTH = {
  perspective: 1200,
  originZ: 70,
  groupSpacing: 520,
  frontScale: 1.16,
  farExtraScale: 0.64,
  passExtraScale: 2.05,
  farDepth: 3.1,
  farOpacity: 0.08,
  opacityDepth: 2.35,
  passDepth: 0.86,
  passFadeStart: 0.48,
  spreadFar: 0.9,
  spreadPass: 1.72,
  interactiveMin: -0.36,
  interactiveMax: 0.68,
  maxZ: 480,
  minZ: -1500,
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

export function clampProgress(progress: number, groupCount: number): number {
  if (groupCount <= 1) return 0;
  return clamp(progress, 0, groupCount - 1);
}

export function depthOf(groupIndex: number, progress: number): number {
  return groupIndex - progress;
}

export function poseAtDepth(depth: number): DepthPose {
  const rawZ = IMMERSIVE_DEPTH.originZ - depth * IMMERSIVE_DEPTH.groupSpacing;
  const z = clamp(rawZ, IMMERSIVE_DEPTH.minZ, IMMERSIVE_DEPTH.maxZ);
  const passing = depth < 0;
  const passT = clamp(-depth / IMMERSIVE_DEPTH.passDepth, 0, 1);
  const front = IMMERSIVE_DEPTH.frontScale;
  const scale = passing
    ? lerp(front, IMMERSIVE_DEPTH.passExtraScale, Math.sqrt(passT))
    : lerp(
        front,
        IMMERSIVE_DEPTH.farExtraScale,
        Math.sqrt(clamp(depth / IMMERSIVE_DEPTH.farDepth, 0, 1)),
      );
  const depthFade = Math.sqrt(
    clamp(depth / IMMERSIVE_DEPTH.opacityDepth, 0, 1),
  );
  const exitFade = clamp(
    (passT - IMMERSIVE_DEPTH.passFadeStart) /
      (1 - IMMERSIVE_DEPTH.passFadeStart),
    0,
    1,
  );
  const opacity = passing
    ? 1 - exitFade
    : lerp(1, IMMERSIVE_DEPTH.farOpacity, depthFade);
  const spread = passing
    ? lerp(
        1,
        IMMERSIVE_DEPTH.spreadPass,
        clamp(-depth / IMMERSIVE_DEPTH.passDepth, 0, 1),
      )
    : lerp(
        1,
        IMMERSIVE_DEPTH.spreadFar,
        clamp(depth / IMMERSIVE_DEPTH.farDepth, 0, 1),
      );
  const tiltScale = passing
    ? lerp(1, 0.2, clamp(-depth, 0, 1))
    : lerp(1, 0.28, clamp(depth / 2.2, 0, 1));
  const interactive =
    depth > IMMERSIVE_DEPTH.interactiveMin &&
    depth < IMMERSIVE_DEPTH.interactiveMax &&
    opacity > 0.46;
  return {
    z,
    scale,
    opacity,
    spread,
    tiltScale,
    interactive,
    zIndex: Math.round(80 - depth * 10),
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
