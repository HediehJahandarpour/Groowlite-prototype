import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProcessToken } from "../src/process/processTypes";
import { buildReflectionContext } from "../src/reflection/reflectionContext";
import { generateScriptedQuestion } from "../src/reflection/scriptedQuestions";
import { validateReflectionQuestion } from "../src/reflection/validateQuestion";

const project = {
  title: "Library redesign",
  description: "Improve study spaces",
  designQuestion: "How might we make quiet study easier?",
  target: "Clear next research step",
};

function token(
  partial: Pick<ProcessToken, "id" | "type" | "label" | "order"> & {
    asset?: string;
  },
): ProcessToken {
  return {
    category:
      partial.type === "phase"
        ? "phase"
        : partial.type === "checkpoint"
          ? "checkpoint"
          : "activity",
    permanent: false,
    asset: partial.asset ?? "token.png",
    ...partial,
  };
}

const process: ProcessToken[] = [
  {
    id: "start",
    type: "start",
    label: "Starting point",
    category: "anchor",
    order: 0,
    permanent: true,
    asset: "vertrekpunt@2x.png",
  },
  token({ id: "a", type: "activity", label: "Research", order: 1 }),
  token({ id: "b", type: "activity", label: "Brainstorm", order: 2 }),
  token({ id: "c", type: "activity", label: "Planning", order: 3 }),
  {
    id: "end",
    type: "end",
    label: "Endpoint",
    category: "anchor",
    order: 4,
    permanent: true,
    asset: "eindpunt@2x.png",
  },
];

describe("reflection Stage A", () => {
  it("builds selected-section context without ranking side effects", () => {
    const context = buildReflectionContext({
      scope: "selected-section",
      tokens: process,
      selectedIds: ["b", "c"],
      project,
      stage: "QUESTION_1",
    });
    assert.ok(context);
    assert.equal(context?.selectedTokens.map((item) => item.label).join(">"), "Brainstorm>Planning");
    assert.equal(context?.preceding[0]?.label, "Research");
    assert.equal(context?.processTokens.length, 3);
  });

  it("generates one validated question per stage", () => {
    const q1Context = buildReflectionContext({
      scope: "selected-section",
      tokens: process,
      selectedIds: ["a", "b", "c"],
      project,
      stage: "QUESTION_1",
    });
    assert.ok(q1Context);
    const q1 = generateScriptedQuestion(q1Context!);
    assert.ok(validateReflectionQuestion(q1));
    assert.match(q1.question, /\?$/);
    assert.equal((q1.question.match(/\?/g) ?? []).length, 1);

    const q2Context = buildReflectionContext({
      scope: "selected-section",
      tokens: process,
      selectedIds: ["a", "b", "c"],
      project,
      stage: "QUESTION_2",
      firstAnswer: "I have several ideas, but I don't know which one would work.",
    });
    assert.ok(q2Context);
    const q2 = generateScriptedQuestion(q2Context!);
    assert.ok(validateReflectionQuestion(q2));
    assert.match(q2.question, /idea/i);
  });

  it("rejects invalid question payloads", () => {
    assert.equal(
      validateReflectionQuestion({
        dimension: "uncertainty",
        question: "One? Two?",
      }),
      null,
    );
    assert.equal(
      validateReflectionQuestion({
        dimension: "nope",
        question: "What are you unsure about?",
      }),
      null,
    );
  });

  it("uses a general follow-up when the first answer is skipped", () => {
    const context = buildReflectionContext({
      scope: "whole-process",
      tokens: process,
      selectedIds: [],
      project,
      stage: "QUESTION_2",
      firstAnswer: "   ",
    });
    assert.ok(context);
    const q2 = generateScriptedQuestion(context!);
    assert.match(q2.question, /next step/i);
  });
});
