import { safeReflectionQuestion } from "./validateQuestion";
import type {
  ReflectionApiRequest,
  ReflectionContext,
  ReflectionQuestionPayload,
} from "./reflectionTypes";

function names(tokens: { label?: string; name?: string }[], limit = 4) {
  return tokens
    .slice(0, limit)
    .map((token) => token.label ?? token.name ?? "")
    .filter(Boolean);
}

function joinLabels(labels: string[]) {
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function sectionPhrase(context: ReflectionContext) {
  if (context.scope === "whole-process") return null;
  return joinLabels(names(context.selectedTokens));
}

function question1(context: ReflectionContext): ReflectionQuestionPayload {
  const section = sectionPhrase(context);
  const phase = context.currentPhaseLabel;
  const projectGoal = context.project.designQuestion.trim();

  if (context.scope === "whole-process") {
    if (projectGoal) {
      return safeReflectionQuestion(
        {
          dimension: "problem_clarification",
          question:
            "Looking at your process, what feels most unclear as you work toward your design question?",
        },
        undefined,
        1,
      );
    }
    if (phase) {
      return safeReflectionQuestion(
        {
          dimension: "uncertainty",
          question: `Looking at your process around ${phase}, what is the biggest uncertainty you are facing?`,
        },
        undefined,
        1,
      );
    }
    if (context.processTokens.length === 0) {
      return safeReflectionQuestion(
        {
          dimension: "problem_clarification",
          question:
            "What are you hoping this process will help you understand or decide?",
        },
        undefined,
        1,
      );
    }
    return safeReflectionQuestion(
      {
        dimension: "uncertainty",
        question:
          "Looking at your process, what is the biggest uncertainty you are facing?",
      },
      undefined,
      1,
    );
  }

  if (section && context.selectedTokens.length >= 2) {
    const first = context.selectedTokens[0].label;
    const last =
      context.selectedTokens[context.selectedTokens.length - 1].label;
    return safeReflectionQuestion(
      {
        dimension: "process_reflection",
        question: `What are you finding most difficult about moving from ${first} to ${last}?`,
      },
      undefined,
      1,
    );
  }

  if (section) {
    return safeReflectionQuestion(
      {
        dimension: "uncertainty",
        question: `What feels most uncertain about ${section} in your process?`,
      },
      undefined,
      1,
    );
  }

  return safeReflectionQuestion(
    {
      dimension: "uncertainty",
      question: "What are you most uncertain about in this part of your process?",
    },
    undefined,
    1,
  );
}

function mentions(answer: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(answer));
}

function question2(context: ReflectionContext): ReflectionQuestionPayload {
  const answer = (context.firstAnswer ?? "").trim();

  if (!answer) {
    return safeReflectionQuestion(
      {
        dimension: "evidence",
        question: "What would help you understand your next step more clearly?",
      },
      undefined,
      2,
    );
  }

  if (
    mentions(answer, [
      /user/i,
      /gebruiker/i,
      /mensen/i,
      /need/i,
      /behoefte/i,
    ])
  ) {
    return safeReflectionQuestion(
      {
        dimension: "evidence",
        question:
          "What evidence would give you more confidence in your understanding of those users?",
      },
      undefined,
      2,
    );
  }

  if (
    mentions(answer, [
      /idea/i,
      /idee/i,
      /concept/i,
      /choose/i,
      /kiezen/i,
      /which/i,
      /welke/i,
    ])
  ) {
    return safeReflectionQuestion(
      {
        dimension: "alternatives",
        question:
          "What would help you understand which idea could work, and why?",
      },
      undefined,
      2,
    );
  }

  if (
    mentions(answer, [
      /assum/i,
      /aanname/i,
      /think/i,
      /denk/i,
      /believe/i,
      /geloof/i,
    ])
  ) {
    return safeReflectionQuestion(
      {
        dimension: "assumptions",
        question:
          "Which assumption behind that challenge would be most useful to examine?",
      },
      undefined,
      2,
    );
  }

  if (
    mentions(answer, [
      /know/i,
      /weet/i,
      /understand/i,
      /begrijp/i,
      /missing/i,
      /ontbreekt/i,
    ])
  ) {
    return safeReflectionQuestion(
      {
        dimension: "evidence",
        question: "What do you still need to understand before you can move on?",
      },
      undefined,
      2,
    );
  }

  if (
    mentions(answer, [
      /decid/i,
      /beslis/i,
      /choice/i,
      /keuze/i,
      /next/i,
      /volgend/i,
    ])
  ) {
    return safeReflectionQuestion(
      {
        dimension: "evaluation",
        question:
          "What outcome would help you judge whether that decision is working?",
      },
      undefined,
      2,
    );
  }

  return safeReflectionQuestion(
    {
      dimension: "alternatives",
      question:
        "What could help you address that challenge without deciding for you?",
    },
    undefined,
    2,
  );
}

/**
 * Scripted fallback generator (Stage A). Used when the model is unavailable
 * or returns an invalid question. Never recommends Groow tokens.
 */
export function generateScriptedQuestion(
  context: ReflectionContext,
): ReflectionQuestionPayload {
  if (context.stage === "QUESTION_1") return question1(context);
  return question2(context);
}

/** Fallback from a validated API request shape (server-side). */
export function generateScriptedQuestionFromApiRequest(
  request: ReflectionApiRequest,
): ReflectionQuestionPayload {
  const context: ReflectionContext = {
    scope:
      request.scope === "selected_section"
        ? "selected-section"
        : "whole-process",
    project: {
      title: request.project.title,
      description: request.project.description ?? "",
      designQuestion: request.project.designQuestion ?? "",
      target: request.project.target ?? "",
    },
    selectedTokens:
      request.scope === "selected_section"
        ? request.process.tokens.map((token, index) => ({
            id: token.id,
            label: token.name,
            type: token.type as ReflectionContext["selectedTokens"][number]["type"],
            order: index,
            phase: token.phase,
          }))
        : [],
    processTokens: request.process.tokens.map((token, index) => ({
      id: token.id,
      label: token.name,
      type: token.type as ReflectionContext["processTokens"][number]["type"],
      order: index,
      phase: token.phase,
    })),
    preceding: request.process.precedingToken
      ? [
          {
            id: "preceding",
            label: request.process.precedingToken,
            type: "activity",
            order: -1,
          },
        ]
      : [],
    following: request.process.followingToken
      ? [
          {
            id: "following",
            label: request.process.followingToken,
            type: "activity",
            order: 999,
          },
        ]
      : [],
    currentPhaseLabel: request.process.currentPhase ?? null,
    firstAnswer: request.answer1 ?? null,
    stage: request.stage === 1 ? "QUESTION_1" : "QUESTION_2",
  };
  return generateScriptedQuestion(context);
}
