import { ACTIVITY_SEMANTICS, type ActivityPurpose, type PurposeSource } from "./activityMetadata";
import type { PhaseId } from "./phasePalette";
import {
  emptyPhaseScores,
  phaseScoresForAsset,
  type AssociationSource,
  type PhaseScoreMap,
} from "../recommendations/colourAnalysis";

export type ActivityRecord = {
  id: string;
  asset: string;
  /** Printed English name on the token. */
  label: string;
  type: "activity";
  category: "activity";
  /** Position in the asset library. Ties in the ranker keep this order. */
  libraryIndex: number;
  phaseAssociations: PhaseScoreMap;
  associationSource: AssociationSource;
  purposes: ActivityPurpose[];
  purposeSource: PurposeSource;
  /** Activities that can sensibly come before this one. */
  predecessors: string[];
  /** Activities that can sensibly come after this one. */
  successors: string[];
  note: string;
};

type ActivityIdentity = {
  id: string;
  asset: string;
  label: string;
};

/**
 * Every activity illustration in `public/tokens`, in library order.
 * Structural tokens (start, end, phases, checkpoint, blanks, emotions,
 * repeat, mascot) are not included. Names are the words printed on the tokens.
 */
const IDENTITIES: ActivityIdentity[] = [
  { id: "acteren", asset: "acteren@2x.png", label: "Act" },
  { id: "alles-mag-alles-kan", asset: "alles-mag-alles-kan@2x.png", label: "No constraints" },
  { id: "brainstorm", asset: "brainstorm@2x.png", label: "Brainstorm" },
  { id: "data-analyse", asset: "data-analyse@2x.png", label: "Data analysis" },
  { id: "de-wereld-in", asset: "de-wereld-in@2x.png", label: "Go into the world" },
  { id: "doe-maar-duurzaam", asset: "doe-maar-duurzaam@2x.png", label: "Make it sustainable" },
  { id: "door-de-ogen-van", asset: "door-de-ogen-van@2x.png", label: "Through the eyes of" },
  { id: "duiveltje", asset: "duiveltje@2x.png", label: "Devil" },
  { id: "echt-nep", asset: "echt-nep@2x.png", label: "Real fake" },
  { id: "engeltje", asset: "engeltje@2x.png", label: "Angel" },
  { id: "enquete", asset: "enquete@2x.png", label: "Survey" },
  { id: "experts-betrekken", asset: "experts-betrekken@2x.png", label: "Involve experts" },
  { id: "filmen", asset: "filmen@2x.png", label: "Film" },
  { id: "gebruikerstest", asset: "gebruikerstest@2x.png", label: "User test" },
  { id: "gedachten-parkeren", asset: "gedachten-parkeren@2x.png", label: "Park those thoughts" },
  { id: "hypothese", asset: "hypothese@2x.png", label: "Hypothesis" },
  { id: "inspiratie-opdoen", asset: "inspiratie-opdoen@2x.png", label: "Get inspiration" },
  { id: "je-doelgroep-leren-kennen", asset: "je-doelgroep-leren-kennen@2x.png", label: "Get to know your audience" },
  { id: "je-gevoel-volgen", asset: "je-gevoel-volgen@2x.png", label: "Go with your gut" },
  { id: "je-zintuigen-gebruiken", asset: "je-zintuigen-gebruiken@2x.png", label: "Use your senses" },
  { id: "keuzes-maken", asset: "keuzes-maken@2x.png", label: "Make a decision" },
  { id: "kwaliteitscontrole", asset: "kwaliteitscontrole@2x.png", label: "Quality control" },
  { id: "literatuur-inzetten", asset: "literatuur-inzetten@2x.png", label: "Using literature" },
  { id: "mindmap", asset: "mindmap@2x.png", label: "Mindmap" },
  { id: "moodboard", asset: "moodboard@2x.png", label: "Moodboard" },
  { id: "nabespreken", asset: "nabespreken@2x.png", label: "Discuss" },
  { id: "nieuw-leven-inblazen", asset: "nieuw-leven-inblazen@2x.png", label: "Repurpose" },
  { id: "ondernemingsplan", asset: "ondernemingsplan@2x.png", label: "Business plan" },
  { id: "onderzoeken", asset: "onderzoeken@2x.png", label: "Research" },
  { id: "organiseren", asset: "organiseren@2x.png", label: "Organize" },
  { id: "persona", asset: "persona@2x.png", label: "Persona" },
  { id: "planning", asset: "planning@2x.png", label: "Planning" },
  { id: "presenteren", asset: "presenteren@2x.png", label: "Present" },
  { id: "programma-van-eisen", asset: "programma-van-eisen@2x.png", label: "Program of requirements" },
  { id: "prototype", asset: "prototype@2x.png", label: "Prototype" },
  { id: "reflecteren", asset: "reflecteren@2x.png", label: "Reflect" },
  { id: "samen-sterk", asset: "samen-sterk@2x.png", label: "Combine your strengths" },
  { id: "samenvatten", asset: "samenvatten@2x.png", label: "Summarize" },
  { id: "scenario", asset: "scenario@2x.png", label: "Scenario" },
  { id: "schetsen", asset: "schetsen@2x.png", label: "Sketch" },
  { id: "succes-bepalen", asset: "succes-bepalen@2x.png", label: "Define success" },
  { id: "tentoonstellen", asset: "tentoonstellen@2x.png", label: "Exhibit" },
  { id: "verslag", asset: "verslag@2x.png", label: "Report" },
  { id: "waarom-vragen-stellen", asset: "waarom-vragen-stellen@2x.png", label: "Ask 'why?'" },
];

function successorsOf(id: string): string[] {
  return IDENTITIES.filter((item) => ACTIVITY_SEMANTICS[item.id]?.follows.includes(id)).map((item) => item.id);
}

function build(identity: ActivityIdentity, libraryIndex: number): ActivityRecord {
  const semantics = ACTIVITY_SEMANTICS[identity.id];
  const colour = phaseScoresForAsset(identity.asset);
  return {
    ...identity,
    type: "activity",
    category: "activity",
    libraryIndex,
    phaseAssociations: colour.scores,
    associationSource: colour.source,
    purposes: semantics?.purposes ?? [],
    purposeSource: semantics?.purposeSource ?? "unknown",
    predecessors: semantics?.follows ?? [],
    successors: successorsOf(identity.id),
    note: identity.label,
  };
}

export const ACTIVITY_REGISTRY: ActivityRecord[] = IDENTITIES.map(build);

/** Assets that use the shared activity pentagon. Geometry falls back to these. */
export const ACTIVITY_ASSETS = ACTIVITY_REGISTRY.map((activity) => activity.asset);

export const ACTIVITY_BY_ID: ReadonlyMap<string, ActivityRecord> = new Map(
  ACTIVITY_REGISTRY.map((activity) => [activity.id, activity]),
);

export const ACTIVITY_BY_ASSET: ReadonlyMap<string, ActivityRecord> = new Map(
  ACTIVITY_REGISTRY.map((activity) => [activity.asset, activity]),
);

export function activityByAsset(asset: string): ActivityRecord | null {
  return ACTIVITY_BY_ASSET.get(asset) ?? null;
}

export function activityById(id: string): ActivityRecord | null {
  return ACTIVITY_BY_ID.get(id) ?? null;
}

/** A blank score map, for tests that invent an activity with no colour reading. */
export function unknownPhaseAssociations(): PhaseScoreMap {
  return emptyPhaseScores();
}

export type { PhaseId };
