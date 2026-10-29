import type { Point, ProcessToken } from "./processTypes";
import { centroid, geometryFor } from "./tokenGeometry";

/** Anchor pose used by the token transform. Heading is clockwise radians. */
export type DragPose = {
  x: number;
  y: number;
  heading: number;
  scale: number;
};

/** Place the artwork so its outline centre sits on `center`. */
export function poseCentered(
  token: ProcessToken,
  center: Point,
  scale: number,
  heading: number,
): DragPose {
  const geometry = geometryFor(token);
  const shape = geometry.outline ?? geometry.pentagon;
  const art = shape && shape.length > 0 ? centroid(shape) : geometry.anchor;
  const dx = art.x - geometry.anchor.x;
  const dy = art.y - geometry.anchor.y;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return {
    x: center.x - scale * (dx * cos - dy * sin),
    y: center.y - scale * (dx * sin + dy * cos),
    heading,
    scale,
  };
}

export function translatedPoses(
  origins: Readonly<Record<string, DragPose>>,
  dx: number,
  dy: number,
  lift: number,
): Record<string, DragPose> {
  const poses: Record<string, DragPose> = {};
  for (const [id, origin] of Object.entries(origins)) {
    poses[id] = {
      x: origin.x + dx,
      y: origin.y + dy,
      heading: origin.heading,
      scale: origin.scale * lift,
    };
  }
  return poses;
}

function lerpAngle(from: number, to: number, t: number) {
  let delta = to - from;
  const turn = Math.PI * 2;
  delta = ((((delta + Math.PI) % turn) + turn) % turn) - Math.PI;
  return from + delta * t;
}

export function lerpPoses(
  from: Readonly<Record<string, DragPose>>,
  to: Readonly<Record<string, DragPose>>,
  t: number,
): Record<string, DragPose> {
  const poses: Record<string, DragPose> = {};
  for (const [id, start] of Object.entries(from)) {
    const end = to[id] ?? start;
    poses[id] = {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      heading: lerpAngle(start.heading, end.heading, t),
      scale: start.scale + (end.scale - start.scale) * t,
    };
  }
  return poses;
}
