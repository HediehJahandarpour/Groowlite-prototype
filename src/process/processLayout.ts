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

function exitEdge(slot: ProcessSlot): WorldEdge {
  return {
    a: slot.exitEdge[0],
    b: slot.exitEdge[1],
    mid: slot.exit,
    normal: edgeOutward(
      slot.polygon,
      SLOT_LAYOUT.outputEdges[slot.index % SLOT_LAYOUT.outputEdges.length],
    ),
  };
}

/** The outline edge whose midpoint is the checkpoint's right side. */
function rightSide(token: ProcessToken): { a: Point; b: Point; normal: Point } {
  const geometry = geometryFor(token);
  const outline = geometry.outline;
  const output = geometry.output;
  if (!outline || !output) throw new Error(`Checkpoint ${token.id} has no right side`);
  for (let index = 0; index < outline.length; index += 1) {
    const a = outline[index];
    const b = outline[(index + 1) % outline.length];
    const mid = midpoint(a, b);
    if (Math.hypot(mid.x - output.x, mid.y - output.y) < 1) {
      return { a, b, normal: edgeOutward(outline, index) };
    }
  }
  throw new Error(`Checkpoint ${token.id} has no right side`);
}

function worldPoint(placed: PlacedToken, point: Point): Point {
  const geometry = geometryFor(placed.token);
  return imageToWorld(point, geometry.anchor, { x: placed.x, y: placed.y }, placed.heading, placed.scale);
}

function worldDirection(placed: PlacedToken, direction: Point): Point {
  const moved = worldPoint(placed, {
    x: geometryFor(placed.token).anchor.x + direction.x,
    y: geometryFor(placed.token).anchor.y + direction.y,
  });
  const dx = moved.x - placed.x;
  const dy = moved.y - placed.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

/**
 * Turn the checkpoint so its left side lies on the previous token and its
 * right side is the edge the next token meets.
 */
function placeCheckpoint(
  token: ProcessToken,
  incoming: WorldEdge,
): { placed: PlacedToken; outgoing: WorldEdge; slot: ProcessSlot } {
  const left = pentagonEdge(token);
  const seat = placeOnEdge(token, left.a, left.b, left.normal, incoming, true);
  const right = rightSide(token);
  const a = worldPoint(seat, right.a);
  const b = worldPoint(seat, right.b);
  const mid = midpoint(a, b);
  const placed = { ...seat, outputX: mid.x, outputY: mid.y };
  const outgoing: WorldEdge = {
    a,
    b,
    mid,
    normal: worldDirection(placed, right.normal),
  };
  const polygon = worldOutline(placed);
  const center = polygon.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  return {
    placed,
    outgoing,
    slot: {
      index: 0,
      x: center.x / polygon.length,
      y: center.y / polygon.length,
      rotation: placed.heading,
      entry: incoming.mid,
      exit: mid,
      entryEdge: [incoming.a, incoming.b],
      exitEdge: [a, b],
      polygon,
    },
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
  const placed: PlacedToken[] = [];
  const slots: ProcessSlot[] = [];
  let edge = exit;

  function pushPentagon(radius: number): ProcessSlot {
    const slot = buildSlots(1, edge, [radius], slots.length)[0];
    slots.push(slot);
    edge = exitEdge(slot);
    return slot;
  }

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

  const occupiedSlots = chain.length + (hole === null ? 0 : 1);
  let chainIndex = 0;
  for (let slotIndex = 0; slotIndex < occupiedSlots; slotIndex += 1) {
    if (hole !== null && slotIndex === hole) {
      pushPentagon(SLOT_LAYOUT.radius);
      continue;
    }
    const token = chain[chainIndex];
    chainIndex += 1;
    if (token.type === "checkpoint") {
      const bridge = placeCheckpoint(token, edge);
      bridge.slot.index = slots.length;
      slots.push(bridge.slot);
      placed.push(bridge.placed);
      edge = bridge.outgoing;
      continue;
    }
    const slot = pushPentagon(radiusFor(token));
    const image = pentagonEdge(token);
    const world: WorldEdge = {
      a: slot.entryEdge[0],
      b: slot.entryEdge[1],
      mid: slot.entry,
      normal: edgeOutward(slot.polygon, SLOT_LAYOUT.inputEdge),
    };
    const seat = placeOnEdge(token, image.a, image.b, image.normal, world, true);
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
  }

  const slotCount = slotRunLength(occupiedSlots);
  while (slots.length < slotCount) {
    const endIndex = hole === null ? chain.length : chain.length + 1;
    pushPentagon(slots.length === endIndex ? endpointRadius() : SLOT_LAYOUT.radius);
  }

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
