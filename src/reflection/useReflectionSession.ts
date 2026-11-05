import { useCallback, useMemo, useRef, useState } from "react";
import type { ProcessToken } from "../process/processTypes";
import {
  buildReflectionContext,
  canReflectOnSelection,
} from "./reflectionContext";
import {
  fetchReflectionQuestion,
  ReflectionRequestError,
} from "./fetchReflectionQuestion";
import { prepareReflectionApiRequest } from "./prepareApiRequest";
import { saveReflection } from "./reflectionStorage";
import { generateScriptedQuestion } from "./scriptedQuestions";
import type {
  ProjectReflectionInfo,
  ReflectionErrorState,
  ReflectionQuestionPayload,
  ReflectionScope,
  ReflectionSessionSnapshot,
  ReflectionStage,
} from "./reflectionTypes";

const EMPTY_PROJECT: ProjectReflectionInfo = {
  title: "",
  description: "",
  designQuestion: "",
  target: "",
};

type StartOptions = {
  scope: ReflectionScope;
  tokens: ProcessToken[];
  selectedIds: readonly string[];
  project?: ProjectReflectionInfo;
};

type SubmitResult = { ok: true } | { ok: false; reason: string };

/**
 * Owns CLOSED → GENERATING_Q1 → Q1 → GENERATING_Q2 → Q2 → COMPLETE.
 * Only the app advances stages; the model never decides session end.
 */
export function useReflectionSession() {
  const [stage, setStage] = useState<ReflectionStage>("CLOSED");
  const [scope, setScope] = useState<ReflectionScope | null>(null);
  const [tokenIds, setTokenIds] = useState<string[]>([]);
  const [project, setProject] = useState<ProjectReflectionInfo>(EMPTY_PROJECT);
  const [processSnapshot, setProcessSnapshot] = useState<ProcessToken[]>([]);
  const [question1, setQuestion1] = useState<ReflectionQuestionPayload | null>(
    null,
  );
  const [answer1, setAnswer1] = useState("");
  const [question2, setQuestion2] = useState<ReflectionQuestionPayload | null>(
    null,
  );
  const [answer2, setAnswer2] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ReflectionErrorState | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastFallbackRef = useRef<ReflectionQuestionPayload | null>(null);

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestSeq.current += 1;
  }, []);

  const reset = useCallback(() => {
    cancelInFlight();
    setStage("CLOSED");
    setScope(null);
    setTokenIds([]);
    setProject(EMPTY_PROJECT);
    setProcessSnapshot([]);
    setQuestion1(null);
    setAnswer1("");
    setQuestion2(null);
    setAnswer2("");
    setSaved(false);
    setError(null);
    setUsedFallback(false);
    lastFallbackRef.current = null;
  }, [cancelInFlight]);

  const runGeneration = useCallback(
    async (options: {
      targetStage: 1 | 2;
      scope: ReflectionScope;
      tokens: ProcessToken[];
      selectedIds: string[];
      project: ProjectReflectionInfo;
      firstAnswer?: string;
      question1Text?: string;
    }) => {
      cancelInFlight();
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      const controller = new AbortController();
      abortRef.current = controller;

      const contextStage =
        options.targetStage === 1 ? "QUESTION_1" : "QUESTION_2";
      const generatingStage: ReflectionStage =
        options.targetStage === 1
          ? "GENERATING_QUESTION_1"
          : "GENERATING_QUESTION_2";

      setError(null);
      setStage(generatingStage);

      const context = buildReflectionContext({
        scope: options.scope,
        tokens: options.tokens,
        selectedIds: options.selectedIds,
        project: options.project,
        stage: contextStage,
        firstAnswer: options.firstAnswer,
      });
      if (!context) {
        setError({
          message: "Missing reflection context.",
          failedStage: options.targetStage,
          canFallback: false,
        });
        setStage(options.targetStage === 1 ? "CLOSED" : "QUESTION_1");
        return;
      }

      const apiRequest = prepareReflectionApiRequest(
        context,
        options.question1Text,
      );
      const fallback = generateScriptedQuestion(context);
      lastFallbackRef.current = fallback;

      try {
        const result = await fetchReflectionQuestion(
          apiRequest,
          controller.signal,
        );
        if (seq !== requestSeq.current) return;
        if (options.targetStage === 1) {
          setQuestion1(result.payload);
          setAnswer1("");
          setQuestion2(null);
          setAnswer2("");
          setUsedFallback(result.source === "fallback");
          setStage("QUESTION_1");
        } else {
          setQuestion2(result.payload);
          setAnswer2("");
          setUsedFallback(result.source === "fallback");
          setStage("QUESTION_2");
        }
      } catch (caught) {
        if (controller.signal.aborted || seq !== requestSeq.current) return;
        const message =
          caught instanceof ReflectionRequestError
            ? caught.message
            : "Something went wrong while preparing the question.";
        setError({
          message,
          failedStage: options.targetStage,
          canFallback: true,
        });
        if (options.targetStage === 1) setQuestion1(null);
        else setQuestion2(null);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [cancelInFlight],
  );

  const start = useCallback(
    (options: StartOptions): boolean => {
      if (
        options.scope === "selected-section" &&
        !canReflectOnSelection(options.tokens, options.selectedIds)
      ) {
        return false;
      }

      const ids =
        options.scope === "selected-section" ? [...options.selectedIds] : [];
      const projectInfo = options.project ?? EMPTY_PROJECT;

      const probe = buildReflectionContext({
        scope: options.scope,
        tokens: options.tokens,
        selectedIds: ids,
        project: projectInfo,
        stage: "QUESTION_1",
      });
      if (!probe) return false;

      setScope(options.scope);
      setTokenIds(ids);
      setProject(projectInfo);
      setProcessSnapshot(options.tokens);
      setQuestion1(null);
      setAnswer1("");
      setQuestion2(null);
      setAnswer2("");
      setSaved(false);
      setUsedFallback(false);
      setError(null);

      void runGeneration({
        targetStage: 1,
        scope: options.scope,
        tokens: options.tokens,
        selectedIds: ids,
        project: projectInfo,
      });
      return true;
    },
    [runGeneration],
  );

  const close = useCallback(() => {
    reset();
  }, [reset]);

  const setDraftAnswer = useCallback(
    (value: string) => {
      if (stage === "QUESTION_1") setAnswer1(value);
      else if (stage === "QUESTION_2") setAnswer2(value);
    },
    [stage],
  );

  const submitAnswer = useCallback((): SubmitResult => {
    if (stage === "QUESTION_1") {
      if (!scope) return { ok: false, reason: "No active reflection." };
      if (!question1) return { ok: false, reason: "Question 1 is not ready." };
      void runGeneration({
        targetStage: 2,
        scope,
        tokens: processSnapshot,
        selectedIds: tokenIds,
        project,
        firstAnswer: answer1,
        question1Text: question1.question,
      });
      return { ok: true };
    }

    if (stage === "QUESTION_2") {
      // Hard stop: never generate a third question.
      setStage("COMPLETE");
      setError(null);
      return { ok: true };
    }

    return { ok: false, reason: "Reflection is not awaiting an answer." };
  }, [
    answer1,
    processSnapshot,
    project,
    question1,
    runGeneration,
    scope,
    stage,
    tokenIds,
  ]);

  const retryGeneration = useCallback(() => {
    if (!scope || !error) return;
    if (error.failedStage === 1) {
      void runGeneration({
        targetStage: 1,
        scope,
        tokens: processSnapshot,
        selectedIds: tokenIds,
        project,
      });
      return;
    }
    void runGeneration({
      targetStage: 2,
      scope,
      tokens: processSnapshot,
      selectedIds: tokenIds,
      project,
      firstAnswer: answer1,
      question1Text: question1?.question,
    });
  }, [
    answer1,
    error,
    processSnapshot,
    project,
    question1?.question,
    runGeneration,
    scope,
    tokenIds,
  ]);

  const continueWithFallback = useCallback(() => {
    if (!error || !scope) return;
    const fallback =
      lastFallbackRef.current ??
      generateScriptedQuestion(
        buildReflectionContext({
          scope,
          tokens: processSnapshot,
          selectedIds: tokenIds,
          project,
          stage: error.failedStage === 1 ? "QUESTION_1" : "QUESTION_2",
          firstAnswer: answer1,
        })!,
      );
    setError(null);
    setUsedFallback(true);
    if (error.failedStage === 1) {
      setQuestion1(fallback);
      setAnswer1("");
      setQuestion2(null);
      setAnswer2("");
      setStage("QUESTION_1");
    } else {
      setQuestion2(fallback);
      setAnswer2("");
      setStage("QUESTION_2");
    }
  }, [answer1, error, processSnapshot, project, scope, tokenIds]);

  const saveCurrent = useCallback((): boolean => {
    if (stage !== "COMPLETE" || !scope || !question1 || !question2) return false;
    saveReflection({
      scope,
      tokenIds,
      question1: question1.question,
      answer1,
      question2: question2.question,
      answer2,
    });
    setSaved(true);
    return true;
  }, [answer1, answer2, question1, question2, scope, stage, tokenIds]);

  const busy =
    stage === "GENERATING_QUESTION_1" || stage === "GENERATING_QUESTION_2";

  const snapshot: ReflectionSessionSnapshot = useMemo(
    () => ({
      stage,
      scope,
      tokenIds,
      context:
        scope &&
        (stage === "QUESTION_1" ||
          stage === "QUESTION_2" ||
          stage === "GENERATING_QUESTION_1" ||
          stage === "GENERATING_QUESTION_2")
          ? buildReflectionContext({
              scope,
              tokens: processSnapshot,
              selectedIds: tokenIds,
              project,
              stage:
                stage === "QUESTION_2" || stage === "GENERATING_QUESTION_2"
                  ? "QUESTION_2"
                  : "QUESTION_1",
              firstAnswer: answer1,
            })
          : null,
      question1,
      answer1,
      question2,
      answer2,
      saved,
      busy,
      error,
      usedFallback,
    }),
    [
      answer1,
      answer2,
      busy,
      error,
      processSnapshot,
      project,
      question1,
      question2,
      saved,
      scope,
      stage,
      tokenIds,
      usedFallback,
    ],
  );

  return {
    snapshot,
    isOpen: stage !== "CLOSED",
    start,
    close,
    setDraftAnswer,
    submitAnswer,
    retryGeneration,
    continueWithFallback,
    saveCurrent,
  };
}
