import type {
  PlacedToken,
  Point,
  ProcessSlot,
  ProcessToken,
} from "./processTypes";
import {
  ACTIVITY_TO_PHASE,
  END_ENTRY_EDGE,
  END_ENTRY_NORMAL,
  START_EXIT_EDGE,
  START_PENTAGON,
  distance,
  edgeOutward,
  geometryFor,
} from "./tokenGeometry";
import {
  SLOT_EDGE,
  SLOT_LAYOUT,
  buildSlots,
  imageToWorld,
  slotRunLength,
  type WorldEdge,
} from "./slotLayout";

export type ProcessLayout = {
  placed: PlacedToken[];
  slots: ProcessSlot[];
  /** How many pentagon slots currently hold an intermediate token. */
  occupied: number;
  /** The first chosen token fills the blue pentagon, so it does not take a slot of its own. */
  seatedInStart: boolean;
};

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The finishing activity's own slot, so the notch closes over that token.
 * Any earlier chain still leaves an activity-sized seat after the last phase.
 */
function endSeatIndex(chain: ProcessToken[], hole: number | null): number {
  const last = chain.length - 1;
  if (last >= 0 && chain[last].type === "activity") {
    return hole !== null && last >= hole ? last + 1 : last;
  }
  return hole === null ? chain.length : chain.length + 1;
}

/**
 * The process finishes with an activity in the endpoint notch.
 * This scale makes that notch the same length as an activity edge.
 */
function activityNotchScale(): number {
  const [a, b] = END_ENTRY_EDGE;
  return (SLOT_EDGE * ACTIVITY_TO_PHASE) / distance(a, b);
}

/** Empty seat the endpoint closes over while it is still waiting for an activity. */
function endpointRadius(): number {
  return SLOT_LAYOUT.radius * ACTIVITY_TO_PHASE;
}

function slotRadii(
  chain: ProcessToken[],
  hole: number | null,
  count: number,
): number[] {
  const endRadius = endpointRadius();
  const endIndex = hole === null ? chain.length : chain.length + 1;
  return Array.from({ length: count }, (_, index) => {
    if (index === endIndex) return endRadius;
    let chainIndex = index;
    if (hole !== null && index === hole) return SLOT_LAYOUT.radius;
    if (hole !== null && index > hole) chainIndex = index - 1;
    return radiusFor(chain[chainIndex]);
  });
}

function radiusFor(token: ProcessToken | undefined): number {
  if (token?.type === "activity") return SLOT_LAYOUT.radius * ACTIVITY_TO_PHASE;
  return SLOT_LAYOUT.radius;
}

function startExitWorld(start: ProcessToken): WorldEdge {
  const geometry = geometryFor(start);
  const [a, b] = START_EXIT_EDGE;
  const tokenScale = SLOT_EDGE / distance(a, b);
  const worldA = imageToWorld(
    a,
    geometry.anchor,
    SLOT_LAYOUT.origin,
    0,
    tokenScale,
  );
  const worldB = imageToWorld(
    b,
    geometry.anchor,
    SLOT_LAYOUT.origin,
    0,
    tokenScale,
  );
  return {
    a: worldA,
    b: worldB,
    mid: midpoint(worldA, worldB),
    normal: edgeOutward(START_PENTAGON, 0),
  };
}

function placeOnEdge(
  token: ProcessToken,
  imageA: Point,
  imageB: Point,
  imageNormal: Point,
  world: WorldEdge,
  sameSide: boolean,
  tokenScale = distance(world.a, world.b) / distance(imageA, imageB),
  outwardShift = 0,
): PlacedToken {
  const target = sameSide
    ? world.normal
    : { x: -world.normal.x, y: -world.normal.y };
  const heading =
    Math.atan2(target.y, target.x) - Math.atan2(imageNormal.y, imageNormal.x);
  return {
    token,
    x: world.mid.x + world.normal.x * outwardShift,
    y: world.mid.y + world.normal.y * outwardShift,
    heading,
    scale: tokenScale,
    outputX: world.mid.x,
    outputY: world.mid.y,
  };
}

/**
 * A checkpoint is turned so its left side meets the previous token and its
 * right side meets the next one. The two side midpoints sit on those joints.
 */
function placeCheckpoint(token: ProcessToken, slot: ProcessSlot): PlacedToken {
  const geometry = geometryFor(token);
  const right = geometry.output;
  if (!right) throw new Error(`Checkpoint ${token.id} has no right side`);
  const axisX = right.x - geometry.anchor.x;
  const axisY = right.y - geometry.anchor.y;
  const axis = Math.hypot(axisX, axisY) || 1;
  const worldX = slot.exit.x - slot.entry.x;
  const worldY = slot.exit.y - slot.entry.y;
  const span = Math.hypot(worldX, worldY) || 1;
  return {
    token,
    x: slot.entry.x,
    y: slot.entry.y,
    heading: Math.atan2(worldY, worldX) - Math.atan2(axisY, axisX),
    scale: span / axis,
    outputX: slot.exit.x,
    outputY: slot.exit.y,
  };
}

function pentagonEdge(token: ProcessToken): {
  a: Point;
  b: Point;
  normal: Point;
} {
  const outline = geometryFor(token).outline;
  if (!outline) {
    throw new Error(`Token ${token.id} has no pentagon outline`);
  }
  const index = SLOT_LAYOUT.inputEdge;
  return {
    a: outline[index],
    b: outline[(index + 1) % outline.length],
    normal: edgeOutward(outline, index),
  };
}

/**
 * Slots are built from the starting point's outgoing edge. Intermediate
 * tokens occupy slots in order. The process finishes with an activity, so
 * the endpoint notch closes over that activity and is sized to fit it.
 * Until an activity is placed, the notch closes over an activity-sized seat.
 * Before anything is placed, the endpoint rests apart from the starting point.
 */
export function layoutProcess(
  tokens: ProcessToken[],
  openSlot: number | null = null,
): ProcessLayout {
  const ordered = [...tokens].sort((a, b) => a.order - b.order);
  const start = ordered.find((token) => token.type === "start");
  const end = ordered.find((token) => token.type === "end");
  const intermediates = ordered.filter(
    (token) =>
      token.type === "phase" ||
      token.type === "activity" ||
      token.type === "checkpoint",
  );
  const first = intermediates[0];
  const seatedInStart = first?.type === "phase" || first?.type === "activity";
  const chain = seatedInStart ? intermediates.slice(1) : intermediates;
  const exit = start
    ? startExitWorld(start)
    : {
        a: SLOT_LAYOUT.origin,
        b: SLOT_LAYOUT.origin,
        mid: SLOT_LAYOUT.origin,
        normal: { x: 1, y: 0 },
      };
  const hole =
    openSlot !== null && openSlot >= 0 && openSlot < chain.length
      ? openSlot
      : null;
  const slotCount = slotRunLength(chain.length + (hole === null ? 0 : 1));
  const slots = buildSlots(slotCount, exit, slotRadii(chain, hole, slotCount));
  const placed: PlacedToken[] = [];

  if (start) {
    const [a, b] = START_EXIT_EDGE;
    placed.push({
      token: start,
      x: SLOT_LAYOUT.origin.x,
      y: SLOT_LAYOUT.origin.y,
      heading: 0,
      scale: SLOT_EDGE / distance(a, b),
      outputX: exit.mid.x,
      outputY: exit.mid.y,
    });
  }

  chain.forEach((token, index) => {
    const slot = slots[hole !== null && index >= hole ? index + 1 : index];
    if (token.type === "checkpoint") {
      placed.push(placeCheckpoint(token, slot));
      return;
    }
    const image = pentagonEdge(token);
    const world: WorldEdge = {
      a: slot.entryEdge[0],
      b: slot.entryEdge[1],
      mid: slot.entry,
      normal: edgeOutward(slot.polygon, SLOT_LAYOUT.inputEdge),
    };
    const seat = placeOnEdge(
      token,
      image.a,
      image.b,
      image.normal,
      world,
      true,
    );
    const geometry = geometryFor(token);
    const tip = geometry.output ?? geometry.anchor;
    const output = imageToWorld(
      tip,
      geometry.anchor,
      { x: seat.x, y: seat.y },
      seat.heading,
      seat.scale,
    );
    placed.push({ ...seat, outputX: output.x, outputY: output.y });
  });

  const endSeat = slots[endSeatIndex(chain, hole)];
  const includeEnd = Boolean(endSeat) && (seatedInStart || chain.length > 0);

  if (end && !includeEnd) {
    placed.push({
      token: end,
      x: SLOT_LAYOUT.endRest.x,
      y: SLOT_LAYOUT.endRest.y,
      heading: 0,
      scale: activityNotchScale(),
      outputX: null,
      outputY: null,
    });
  } else if (end && endSeat) {
    const target: WorldEdge = {
      a: endSeat.exitEdge[0],
      b: endSeat.exitEdge[1],
      mid: endSeat.exit,
      normal: edgeOutward(
        endSeat.polygon,
        SLOT_LAYOUT.outputEdges[endSeat.index % SLOT_LAYOUT.outputEdges.length],
      ),
    };
    const [a, b] = END_ENTRY_EDGE;
    placed.push(placeOnEdge(end, a, b, END_ENTRY_NORMAL, target, false));
  }

  return { placed, slots, occupied: chain.length, seatedInStart };
}

export function tokenWorldOutline(item: PlacedToken): Point[] {
  return worldOutline(item);
}

function worldOutline(item: PlacedToken): Point[] {
  const geometry = geometryFor(item.token);
  const outline = geometry.pentagon ?? geometry.outline;
  if (!outline || outline.length === 0) return [{ x: item.x, y: item.y }];
  return outline.map((point) =>
    imageToWorld(
      point,
      geometry.anchor,
      { x: item.x, y: item.y },
      item.heading,
      item.scale,
    ),
  );
}

export function tokenTransform(placed: PlacedToken): string {
  const { anchor } = geometryFor(placed.token);
  const degrees = (placed.heading * 180) / Math.PI;
  return [
    `translate(${placed.x}px, ${placed.y}px)`,
    `rotate(${degrees}deg)`,
    `scale(${placed.scale})`,
    `translate(${-anchor.x}px, ${-anchor.y}px)`,
  ].join(" ");
}
