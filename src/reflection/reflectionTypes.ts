/** Reflection scope for the AI Reflector (Stage A + B). */
export type ReflectionScope = "whole-process" | "selected-section";

/**
 * Interaction stages. The app owns transitions; the model never does.
 * GENERATING_* stages are UI-only while an AI request is in flight.
 */
export type ReflectionStage =
  | "CLOSED"
  | "GENERATING_QUESTION_1"
  | "QUESTION_1"
  | "GENERATING_QUESTION_2"
  | "QUESTION_2"
  | "COMPLETE";

/** Socratic dimension tags for generated questions (Stage B schema). */
export type ReflectionDimension =
  | "problem_clarification"
  | "uncertainty"
  | "assumptions"
  | "evidence"
  | "alternatives"
  | "evaluation"
  | "process_reflection";

/** Validated model / scripted output shape. */
export type ReflectionQuestionPayload = {
  dimension: ReflectionDimension;
  question: string;
  stage?: 1 | 2;
};

export type ProjectReflectionInfo = {
  title: string;
  description: string;
  designQuestion: string;
  target: string;
};

export type ReflectionTokenSummary = {
  id: string;
  label: string;
  type: "phase" | "activity" | "checkpoint";
  order: number;
  phase?: string;
};

export type ReflectionContext = {
  scope: ReflectionScope;
  project: ProjectReflectionInfo;
  /** Selected tokens in process order (empty for whole-process). */
  selectedTokens: ReflectionTokenSummary[];
  /** Full ordered middle process (phase / activity / checkpoint). */
  processTokens: ReflectionTokenSummary[];
  preceding: ReflectionTokenSummary[];
  following: ReflectionTokenSummary[];
  currentPhaseLabel: string | null;
  /** Present when generating Question 2. */
  firstAnswer: string | null;
  stage: "QUESTION_1" | "QUESTION_2";
};

export type SavedReflection = {
  id: string;
  scope: ReflectionScope;
  tokenIds: string[];
  question1: string;
  answer1: string;
  question2: string;
  answer2: string;
  timestamp: string;
};

export type ReflectionErrorState = {
  message: string;
  /** Stage that failed to generate. */
  failedStage: 1 | 2;
  canFallback: boolean;
};

export type ReflectionSessionSnapshot = {
  stage: ReflectionStage;
  scope: ReflectionScope | null;
  tokenIds: string[];
  context: ReflectionContext | null;
  question1: ReflectionQuestionPayload | null;
  answer1: string;
  question2: ReflectionQuestionPayload | null;
  answer2: string;
  saved: boolean;
  busy: boolean;
  error: ReflectionErrorState | null;
  /** Whether the visible question came from the scripted fallback. */
  usedFallback: boolean;
};

/** Wire format for POST /api/reflection/question */
export type ReflectionApiRequest = {
  stage: 1 | 2;
  scope: "selected_section" | "whole_process";
  project: {
    title: string;
    description?: string;
    designQuestion?: string;
    target?: string;
  };
  process: {
    tokens: Array<{
      id: string;
      name: string;
      type: string;
      phase?: string;
    }>;
    precedingToken?: string;
    followingToken?: string;
    currentPhase?: string;
  };
  question1?: string;
  answer1?: string;
};

export type ReflectionApiResponse = {
  stage: 1 | 2;
  dimension: ReflectionDimension;
  question: string;
  source: "model" | "fallback";
};
