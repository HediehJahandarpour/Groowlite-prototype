import { PHASE_LABEL, type PhaseId } from "./phasePalette";

export type ActivityInfo = {
  /** Design phase this activity is most useful in. */
  bestFor: PhaseId;
  /** What doing the activity helps someone achieve. */
  whenToUse: string;
};

/**
 * Copy for the activity hover card.
 * Best for names the Groow phase. When to use names the outcome.
 */
export const ACTIVITY_INFO: Record<string, ActivityInfo> = {
  acteren: {
    bestFor: "design",
    whenToUse: "Use this token when you want to feel how an idea plays out by acting it out.",
  },
  "alles-mag-alles-kan": {
    bestFor: "design",
    whenToUse: "Use this token when you want ideas you would normally rule out.",
  },
  brainstorm: {
    bestFor: "design",
    whenToUse: "Use this token when you want a wide range of ideas to choose from.",
  },
  "data-analyse": {
    bestFor: "understand",
    whenToUse: "Use this token when you want patterns you can trust in what you collected.",
  },
  "de-wereld-in": {
    bestFor: "discover",
    whenToUse: "Use this token when you want to see how something really happens, outside the studio.",
  },
  "doe-maar-duurzaam": {
    bestFor: "design",
    whenToUse: "Use this token when you want the idea to last and do less harm.",
  },
  "door-de-ogen-van": {
    bestFor: "discover",
    whenToUse: "Use this token when you want to see a situation from someone else's point of view.",
  },
  duiveltje: {
    bestFor: "design",
    whenToUse: "Use this token when you want the weak spots in an idea, before you commit to it.",
  },
  "echt-nep": {
    bestFor: "make",
    whenToUse: "Use this token when you want to know how real a try-out needs to feel.",
  },
  engeltje: {
    bestFor: "design",
    whenToUse: "Use this token when you want the strongest reasons to keep an idea.",
  },
  enquete: {
    bestFor: "discover",
    whenToUse: "Use this token when you want to hear from many people and see what they share.",
  },
  "experts-betrekken": {
    bestFor: "discover",
    whenToUse: "Use this token when you want knowledge you cannot find on your own.",
  },
  filmen: {
    bestFor: "share",
    whenToUse: "Use this token when you want others to follow the story of the work.",
  },
  gebruikerstest: {
    bestFor: "make",
    whenToUse: "Use this token when you want to know whether people can use what you made.",
  },
  "gedachten-parkeren": {
    bestFor: "understand",
    whenToUse: "Use this token when you want a clear head for the question in front of you.",
  },
  hypothese: {
    bestFor: "understand",
    whenToUse: "Use this token when you want a belief you can go and test.",
  },
  "inspiratie-opdoen": {
    bestFor: "discover",
    whenToUse: "Use this token when you want references that open a new direction.",
  },
  "je-doelgroep-leren-kennen": {
    bestFor: "discover",
    whenToUse: "Use this token when you want to know who you are designing for and what they need.",
  },
  "je-gevoel-volgen": {
    bestFor: "design",
    whenToUse: "Use this token when you want a direction you trust, even before every fact is in.",
  },
  "je-zintuigen-gebruiken": {
    bestFor: "discover",
    whenToUse: "Use this token when you want a direct sense of a place, an object, or a moment.",
  },
  "keuzes-maken": {
    bestFor: "design",
    whenToUse: "Use this token when you want one direction, and a reason to leave the others.",
  },
  kwaliteitscontrole: {
    bestFor: "make",
    whenToUse: "Use this token when you want to know the work does what it needs to do.",
  },
  "literatuur-inzetten": {
    bestFor: "understand",
    whenToUse: "Use this token when you want the project grounded in what is already known.",
  },
  mindmap: {
    bestFor: "design",
    whenToUse: "Use this token when you want to see how your ideas connect, and what is missing.",
  },
  moodboard: {
    bestFor: "design",
    whenToUse: "Use this token when you want a shared sense of how the idea should look and feel.",
  },
  nabespreken: {
    bestFor: "share",
    whenToUse: "Use this token when you want to hear what others understood, and what to change.",
  },
  "nieuw-leven-inblazen": {
    bestFor: "design",
    whenToUse: "Use this token when you want a new use for something that already exists.",
  },
  ondernemingsplan: {
    bestFor: "make",
    whenToUse: "Use this token when you want a practical picture of how the idea can exist.",
  },
  onderzoeken: {
    bestFor: "discover",
    whenToUse: "Use this token when you want to find out what is true before you decide what to make.",
  },
  organiseren: {
    bestFor: "make",
    whenToUse: "Use this token when you want the work in an order you can carry out.",
  },
  persona: {
    bestFor: "discover",
    whenToUse: "Use this token when you want one clear person to design for.",
  },
  planning: {
    bestFor: "make",
    whenToUse: "Use this token when you want to know what happens next, and when.",
  },
  presenteren: {
    bestFor: "share",
    whenToUse: "Use this token when you want others to understand the idea and why it matters.",
  },
  "programma-van-eisen": {
    bestFor: "design",
    whenToUse: "Use this token when you want agreement on what the outcome must do.",
  },
  prototype: {
    bestFor: "make",
    whenToUse: "Use this token when you want the idea in your hands, so you can try it.",
  },
  reflecteren: {
    bestFor: "share",
    whenToUse: "Use this token when you want to see what you learned and what to do differently.",
  },
  "samen-sterk": {
    bestFor: "design",
    whenToUse: "Use this token when you want each person's strength to shape the work.",
  },
  samenvatten: {
    bestFor: "understand",
    whenToUse: "Use this token when you want the important points in one clear picture.",
  },
  scenario: {
    bestFor: "design",
    whenToUse: "Use this token when you want to see how someone moves through the idea.",
  },
  schetsen: {
    bestFor: "design",
    whenToUse: "Use this token when you want an idea out of your head, so you can look at it.",
  },
  "succes-bepalen": {
    bestFor: "understand",
    whenToUse: "Use this token when you want to agree what a good result looks like.",
  },
  tentoonstellen: {
    bestFor: "share",
    whenToUse: "Use this token when you want people to meet the work and respond to it.",
  },
  verslag: {
    bestFor: "share",
    whenToUse: "Use this token when you want a record of what you did and what you found.",
  },
  "waarom-vragen-stellen": {
    bestFor: "understand",
    whenToUse: "Use this token when you want the reason underneath the first answer.",
  },
};

export function activityInfoFor(id: string): ActivityInfo | null {
  return ACTIVITY_INFO[id] ?? null;
}

export function bestForLabel(phase: PhaseId): string {
  return PHASE_LABEL[phase];
}
