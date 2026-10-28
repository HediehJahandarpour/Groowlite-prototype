export type TokenCategory = "anchor" | "phase" | "activity" | "checkpoint";

export type TokenType = "start" | "end" | "phase" | "activity" | "checkpoint";

/** Ordered process structure. Screen positions are not stored here. */
export type ProcessToken = {
  id: string;
  type: TokenType;
  label: string;
  category: TokenCategory;
  order: number;
  /** Starting Point and Endpoint stay fixed at the ends of the sequence. */
  permanent: boolean;
  asset: string;
  /**
   * Extra turns of the artwork, in pentagon steps (72°).
   * The magnetic slot does not move.
   */
  turn?: number;
};

export type Point = {
  x: number;
  y: number;
};

export type TokenGeometry = {
  width: number;
  height: number;
  /** Incoming joint. For the start token this is the outgoing tip. */
  anchor: Point;
  /** Outgoing tip. Absent on the endpoint, and on the start token whose anchor is already that tip. */
  output: Point | null;
  /** Clockwise degrees that turn the artwork's forward axis to the right. */
  artRotation: number;
  /** Blue pentagon seated in the starting-point notch, in image pixels. */
  pentagon?: Point[];
  /**
   * Convex outline of the piece that the next token must meet.
   * Used to sink the next edge onto this tip until the two sides touch.
   */
  outline?: Point[];
  /** Length of the edge that receives the previous tip, in image pixels. */
  inputWidth?: number;
};

export type PlacedToken = {
  token: ProcessToken;
  /** World position of the token's anchor point. */
  x: number;
  y: number;
  /** Clockwise radians that turn the artwork onto its slot. */
  heading: number;
  /** Image pixels to world pixels for this token. */
  scale: number;
  outputX: number | null;
  outputY: number | null;
};

/**
 * One pentagonal seat in the hidden chain.
 * Positions are derived from the previous slot's outgoing edge.
 */
export type ProcessSlot = {
  index: number;
  x: number;
  y: number;
  /** Clockwise radians from the point-up pentagon. */
  rotation: number;
  entry: Point;
  exit: Point;
  entryEdge: [Point, Point];
  exitEdge: [Point, Point];
  polygon: Point[];
};
