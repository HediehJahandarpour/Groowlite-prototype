/**
 * Provisional readings of what each printed activity name is for.
 * Groow does not ship an official purpose table in this project, so nothing
 * here is marked official. Activities whose name does not map cleanly onto a
 * purpose stay unknown and are not given an invented meaning.
 *
 * `follows` lists activities this one can sensibly come after. The link is
 * only recorded where the names support it. Missing links stay neutral in
 * the ranker; they are not treated as mistakes.
 */

export type ActivityPurpose =
  | "problem-exploration"
  | "research"
  | "user-understanding"
  | "information-gathering"
  | "data-analysis"
  | "insight-synthesis"
  | "ideation"
  | "concept-development"
  | "decision-making"
  | "prototyping"
  | "testing"
  | "evaluation"
  | "reflection"
  | "communication"
  | "planning";

export type PurposeSource = "official" | "provisional" | "unknown";

export type ActivitySemantics = {
  purposes: ActivityPurpose[];
  purposeSource: PurposeSource;
  /** Ids of activities this one can sensibly follow. */
  follows: string[];
};

export const PURPOSE_LABEL: Record<ActivityPurpose, string> = {
  "problem-exploration": "problem exploration",
  research: "research",
  "user-understanding": "user understanding",
  "information-gathering": "information gathering",
  "data-analysis": "data analysis",
  "insight-synthesis": "insight synthesis",
  ideation: "ideation",
  "concept-development": "concept development",
  "decision-making": "decision making",
  prototyping: "prototyping",
  testing: "testing",
  evaluation: "evaluation",
  reflection: "reflection",
  communication: "communication",
  planning: "planning",
};

/**
 * A flexible design process, not a required Groow sequence.
 * Used only for the small workflow term. Stepping backward is a normal
 * iteration, not an error.
 */
export const PURPOSE_NEXT: Record<ActivityPurpose, ActivityPurpose[]> = {
  "problem-exploration": ["research", "information-gathering", "user-understanding", "ideation"],
  research: ["data-analysis", "insight-synthesis", "user-understanding", "problem-exploration"],
  "user-understanding": ["insight-synthesis", "ideation", "information-gathering"],
  "information-gathering": ["data-analysis", "insight-synthesis", "user-understanding"],
  "data-analysis": ["insight-synthesis", "decision-making"],
  "insight-synthesis": ["ideation", "concept-development", "decision-making"],
  ideation: ["concept-development", "decision-making", "insight-synthesis"],
  "concept-development": ["prototyping", "decision-making", "planning"],
  "decision-making": ["planning", "prototyping", "concept-development"],
  planning: ["prototyping", "communication"],
  prototyping: ["testing", "evaluation", "communication"],
  testing: ["evaluation", "reflection", "insight-synthesis"],
  evaluation: ["reflection", "decision-making", "communication"],
  reflection: ["problem-exploration", "ideation", "research", "planning"],
  communication: ["reflection", "evaluation"],
};

export const ACTIVITY_SEMANTICS: Record<string, ActivitySemantics> = {
  acteren: { purposes: [], purposeSource: "unknown", follows: [] },
  "alles-mag-alles-kan": { purposes: ["ideation"], purposeSource: "provisional", follows: [] },
  brainstorm: {
    purposes: ["ideation"],
    purposeSource: "provisional",
    follows: ["inspiratie-opdoen", "alles-mag-alles-kan"],
  },
  "data-analyse": {
    purposes: ["data-analysis"],
    purposeSource: "provisional",
    follows: ["onderzoeken", "enquete", "literatuur-inzetten", "de-wereld-in", "experts-betrekken", "je-zintuigen-gebruiken"],
  },
  "de-wereld-in": {
    purposes: ["research"],
    purposeSource: "provisional",
    follows: ["waarom-vragen-stellen"],
  },
  "doe-maar-duurzaam": { purposes: [], purposeSource: "unknown", follows: [] },
  "door-de-ogen-van": {
    purposes: ["user-understanding"],
    purposeSource: "provisional",
    follows: ["je-doelgroep-leren-kennen"],
  },
  duiveltje: { purposes: [], purposeSource: "unknown", follows: [] },
  "echt-nep": {
    purposes: ["evaluation"],
    purposeSource: "provisional",
    follows: ["prototype", "gebruikerstest"],
  },
  engeltje: { purposes: [], purposeSource: "unknown", follows: [] },
  enquete: {
    purposes: ["information-gathering"],
    purposeSource: "provisional",
    follows: ["je-doelgroep-leren-kennen", "waarom-vragen-stellen"],
  },
  "experts-betrekken": {
    purposes: ["research", "information-gathering"],
    purposeSource: "provisional",
    follows: ["onderzoeken", "waarom-vragen-stellen"],
  },
  filmen: {
    purposes: ["communication"],
    purposeSource: "provisional",
    follows: ["prototype", "scenario"],
  },
  gebruikerstest: {
    purposes: ["testing"],
    purposeSource: "provisional",
    follows: ["prototype"],
  },
  "gedachten-parkeren": { purposes: [], purposeSource: "unknown", follows: [] },
  hypothese: {
    purposes: ["problem-exploration"],
    purposeSource: "provisional",
    follows: ["waarom-vragen-stellen", "onderzoeken"],
  },
  "inspiratie-opdoen": {
    purposes: ["ideation"],
    purposeSource: "provisional",
    follows: ["de-wereld-in"],
  },
  "je-doelgroep-leren-kennen": {
    purposes: ["user-understanding"],
    purposeSource: "provisional",
    follows: ["onderzoeken", "waarom-vragen-stellen"],
  },
  "je-gevoel-volgen": {
    purposes: ["decision-making"],
    purposeSource: "provisional",
    follows: ["brainstorm", "keuzes-maken"],
  },
  "je-zintuigen-gebruiken": {
    purposes: ["research"],
    purposeSource: "provisional",
    follows: ["de-wereld-in", "onderzoeken"],
  },
  "keuzes-maken": {
    purposes: ["decision-making"],
    purposeSource: "provisional",
    follows: ["brainstorm", "mindmap", "alles-mag-alles-kan", "inspiratie-opdoen"],
  },
  kwaliteitscontrole: {
    purposes: ["evaluation"],
    purposeSource: "provisional",
    follows: ["prototype", "gebruikerstest"],
  },
  "literatuur-inzetten": {
    purposes: ["research"],
    purposeSource: "provisional",
    follows: ["waarom-vragen-stellen", "onderzoeken"],
  },
  mindmap: {
    purposes: ["ideation", "insight-synthesis"],
    purposeSource: "provisional",
    follows: ["brainstorm", "inspiratie-opdoen", "alles-mag-alles-kan"],
  },
  moodboard: {
    purposes: ["concept-development"],
    purposeSource: "provisional",
    follows: ["inspiratie-opdoen", "brainstorm"],
  },
  nabespreken: {
    purposes: ["reflection", "communication"],
    purposeSource: "provisional",
    follows: ["gebruikerstest", "presenteren", "reflecteren"],
  },
  "nieuw-leven-inblazen": {
    purposes: ["concept-development"],
    purposeSource: "provisional",
    follows: ["brainstorm", "reflecteren"],
  },
  ondernemingsplan: {
    purposes: ["planning", "communication"],
    purposeSource: "provisional",
    follows: ["keuzes-maken", "planning", "programma-van-eisen"],
  },
  onderzoeken: {
    purposes: ["research"],
    purposeSource: "provisional",
    follows: ["waarom-vragen-stellen", "hypothese"],
  },
  organiseren: {
    purposes: ["planning"],
    purposeSource: "provisional",
    follows: ["planning", "keuzes-maken"],
  },
  persona: {
    purposes: ["user-understanding"],
    purposeSource: "provisional",
    follows: ["je-doelgroep-leren-kennen", "door-de-ogen-van", "enquete"],
  },
  planning: {
    purposes: ["planning"],
    purposeSource: "provisional",
    follows: ["keuzes-maken", "programma-van-eisen", "succes-bepalen"],
  },
  presenteren: {
    purposes: ["communication"],
    purposeSource: "provisional",
    follows: ["prototype", "verslag", "filmen", "tentoonstellen"],
  },
  "programma-van-eisen": {
    purposes: ["planning"],
    purposeSource: "provisional",
    follows: ["succes-bepalen", "keuzes-maken", "onderzoeken"],
  },
  prototype: {
    purposes: ["prototyping"],
    purposeSource: "provisional",
    follows: ["schetsen", "scenario", "moodboard", "programma-van-eisen"],
  },
  reflecteren: {
    purposes: ["reflection"],
    purposeSource: "provisional",
    follows: ["gebruikerstest", "kwaliteitscontrole", "presenteren", "tentoonstellen", "nabespreken"],
  },
  "samen-sterk": { purposes: [], purposeSource: "unknown", follows: [] },
  samenvatten: {
    purposes: ["insight-synthesis"],
    purposeSource: "provisional",
    follows: ["data-analyse", "onderzoeken", "enquete", "brainstorm", "mindmap"],
  },
  scenario: {
    purposes: ["concept-development"],
    purposeSource: "provisional",
    follows: ["brainstorm", "persona", "mindmap"],
  },
  schetsen: {
    purposes: ["concept-development"],
    purposeSource: "provisional",
    follows: ["brainstorm", "mindmap", "moodboard", "inspiratie-opdoen"],
  },
  "succes-bepalen": {
    purposes: ["evaluation"],
    purposeSource: "provisional",
    follows: ["onderzoeken", "je-doelgroep-leren-kennen"],
  },
  tentoonstellen: {
    purposes: ["communication"],
    purposeSource: "provisional",
    follows: ["prototype", "filmen"],
  },
  verslag: {
    purposes: ["communication"],
    purposeSource: "provisional",
    follows: ["onderzoeken", "data-analyse", "gebruikerstest", "samenvatten"],
  },
  "waarom-vragen-stellen": {
    purposes: ["problem-exploration"],
    purposeSource: "provisional",
    follows: [],
  },
};
