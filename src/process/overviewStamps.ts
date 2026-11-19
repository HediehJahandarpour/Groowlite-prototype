import type { OverviewStampId, SlotStamps } from "./processTypes";

export type OverviewStamp = {
  id: OverviewStampId;
  label: string;
  asset: string;
  /** Native artwork size, in image pixels. */
  width: number;
  height: number;
  /** Placement inside the 539 × 117.375 toolbar, matching Figma 6124:208273. */
  x: number;
  y: number;
  displayWidth: number;
  displayHeight: number;
  /**
   * Where the artwork meets the ground, as a percentage of the image height.
   * The rest below that line is transparent padding.
   */
  foot: number;
};

/** Wooden pieces shown while the process overview is on screen. */
export const OVERVIEW_STAMPS: readonly OverviewStamp[] = [
  {
    id: "groowy",
    label: "Groowy",
    asset: "groowy@2x.png",
    width: 205,
    height: 303,
    x: 0,
    y: 2,
    displayWidth: 76.875,
    displayHeight: 113.625,
    foot: (286 / 303) * 100,
  },
  {
    id: "checkpoint",
    label: "Checkpoint",
    asset: "checkpunt@2x.png",
    width: 259,
    height: 313,
    x: 93.875,
    y: 0,
    displayWidth: 97.125,
    displayHeight: 117.375,
    foot: (278 / 313) * 100,
  },
  {
    id: "activity",
    label: "Open activity",
    asset: "blanco_1@2x.png",
    width: 313,
    height: 313,
    x: 208,
    y: 0,
    displayWidth: 117.375,
    displayHeight: 117.375,
    foot: (277 / 313) * 100,
  },
  {
    id: "repeat",
    label: "Repeat",
    asset: "herhaal@2x.png",
    width: 278,
    height: 234,
    x: 342.375,
    y: 15,
    displayWidth: 104.25,
    displayHeight: 87.75,
    foot: (217 / 234) * 100,
  },
  {
    id: "content",
    label: "Content",
    asset: "content@2x.png",
    width: 200,
    height: 188,
    x: 464,
    y: 24,
    displayWidth: 75,
    displayHeight: 70.5,
    foot: (174 / 188) * 100,
  },
];

export const OVERVIEW_TOOLBAR = {
  width: 539,
  height: 117.375,
};

export function stampById(id: OverviewStampId): OverviewStamp {
  const stamp = OVERVIEW_STAMPS.find((item) => item.id === id);
  if (!stamp) throw new Error(`Unknown overview stamp ${id}`);
  return stamp;
}

/**
 * Put a toolbar piece on the top of a token's slot.
 * Dropping the same piece there again lifts it off.
 */
export function applySlotStamp(
  stamps: SlotStamps,
  tokenId: string,
  stampId: OverviewStampId,
): SlotStamps {
  if (!tokenId) return stamps;
  const next = { ...stamps };
  if (next[tokenId] === stampId) delete next[tokenId];
  else next[tokenId] = stampId;
  return next;
}
