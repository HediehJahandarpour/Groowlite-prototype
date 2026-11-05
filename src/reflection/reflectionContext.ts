import { phaseFromAsset, PHASE_LABEL } from "../data/phasePalette";
import { isSelectableToken, selectedInProcessOrder } from "../process/multiSelect";
import type { ProcessToken } from "../process/processTypes";
import type {
  ProjectReflectionInfo,
  ReflectionContext,
  ReflectionScope,
  ReflectionTokenSummary,
} from "./reflectionTypes";

const NEIGHBOUR_WINDOW = 2;

function middleTokens(tokens: ProcessToken[]): ProcessToken[] {
  return tokens
    .filter(isSelectableToken)
    .slice()
    .sort((a, b) => a.order - b.order);
}

function toSummary(token: ProcessToken): ReflectionTokenSummary {
  const phase =
    token.type === "phase" ? phaseFromAsset(token.asset) : null;
  return {
    id: token.id,
    label: token.label,
    type: token.type as ReflectionTokenSummary["type"],
    order: token.order,
    ...(phase ? { phase: PHASE_LABEL[phase] } : {}),
  };
}

function phaseLabelNear(
  process: ProcessToken[],
  around: ProcessToken[],
): string | null {
  const focus = around.at(-1) ?? process.at(-1);
  if (!focus) return null;
  const ordered = middleTokens(process);
  const focusIndex = ordered.findIndex((token) => token.id === focus.id);
  const searchFrom = focusIndex >= 0 ? focusIndex : ordered.length - 1;
  for (let cursor = searchFrom; cursor >= 0; cursor -= 1) {
    const token = ordered[cursor];
    if (token.type !== "phase") continue;
    const phase = phaseFromAsset(token.asset);
    if (phase) return PHASE_LABEL[phase];
  }
  for (const token of ordered) {
    if (token.type !== "phase") continue;
    const phase = phaseFromAsset(token.asset);
    if (phase) return PHASE_LABEL[phase];
  }
  return null;
}

function neighbours(
  process: ProcessToken[],
  selected: ProcessToken[],
): { preceding: ReflectionTokenSummary[]; following: ReflectionTokenSummary[] } {
  if (selected.length === 0) {
    return { preceding: [], following: [] };
  }
  const ordered = middleTokens(process);
  const firstOrder = selected[0].order;
  const lastOrder = selected[selected.length - 1].order;
  const preceding = ordered
    .filter((token) => token.order < firstOrder)
    .slice(-NEIGHBOUR_WINDOW)
    .map(toSummary);
  const following = ordered
    .filter((token) => token.order > lastOrder)
    .slice(0, NEIGHBOUR_WINDOW)
    .map(toSummary);
  return { preceding, following };
}

/**
 * Builds reflector-only context. Does not touch ranking, filters, or explorer state.
 */
export function buildReflectionContext(options: {
  scope: ReflectionScope;
  tokens: ProcessToken[];
  selectedIds: readonly string[];
  project: ProjectReflectionInfo;
  stage: "QUESTION_1" | "QUESTION_2";
  firstAnswer?: string | null;
}): ReflectionContext | null {
  const process = middleTokens(options.tokens);
  const selected =
    options.scope === "selected-section"
      ? selectedInProcessOrder(options.tokens, options.selectedIds)
      : [];

  if (options.scope === "selected-section" && selected.length === 0) {
    return null;
  }

  const focus = options.scope === "selected-section" ? selected : process;
  const { preceding, following } =
    options.scope === "selected-section"
      ? neighbours(options.tokens, selected)
      : { preceding: [], following: [] };

  return {
    scope: options.scope,
    project: options.project,
    selectedTokens: selected.map(toSummary),
    processTokens: process.map(toSummary),
    preceding,
    following,
    currentPhaseLabel: phaseLabelNear(options.tokens, focus),
    firstAnswer: options.firstAnswer?.trim() ? options.firstAnswer.trim() : null,
    stage: options.stage,
  };
}

export function canReflectOnSelection(
  tokens: ProcessToken[],
  selectedIds: readonly string[],
) {
  return selectedInProcessOrder(tokens, selectedIds).length > 0;
}
