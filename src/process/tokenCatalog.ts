import type { TokenCategory, TokenType } from "./processTypes";

export type MenuCategory = "phase" | "activity" | "checkpoint";

export type CatalogEntry = {
  id: string;
  asset: string;
  label: string;
  type: TokenType;
  category: TokenCategory;
};

/** Tokens offered from the pentagonal add menu. Step 4 replaces this list. */
export const TOKEN_CATALOG: Record<MenuCategory, CatalogEntry[]> = {
  phase: [
    { id: "understand", asset: "begrijpen@2x.png", label: "Understand", type: "phase", category: "phase" },
    { id: "discover", asset: "ontdekken@2x.png", label: "Discover", type: "phase", category: "phase" },
    { id: "design", asset: "ontwerpen@2x.png", label: "Design", type: "phase", category: "phase" },
    { id: "make", asset: "maken@2x.png", label: "Make", type: "phase", category: "phase" },
    { id: "share", asset: "delen@2x.png", label: "Share", type: "phase", category: "phase" },
  ],
  activity: [
    { id: "brainstorm", asset: "brainstorm@2x.png", label: "Brainstorm", type: "activity", category: "activity" },
    { id: "planning", asset: "planning@2x.png", label: "Planning", type: "activity", category: "activity" },
    { id: "reflect", asset: "reflecteren@2x.png", label: "Reflect", type: "activity", category: "activity" },
    { id: "research", asset: "onderzoeken@2x.png", label: "Research", type: "activity", category: "activity" },
  ],
  checkpoint: [
    { id: "checkpoint", asset: "checkpunt@2x.png", label: "Checkpoint", type: "checkpoint", category: "checkpoint" },
  ],
};

export const MENU_CATEGORIES: Array<{ id: MenuCategory; label: string }> = [
  { id: "phase", label: "Phases" },
  { id: "activity", label: "Activities" },
  { id: "checkpoint", label: "Checkpoint" },
];
