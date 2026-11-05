import { X } from "lucide-react";
import type { ReflectionSessionSnapshot } from "../../reflection/reflectionTypes";
import { ReflectionAnswerInput } from "./ReflectionAnswerInput";
import { ReflectionQuestion } from "./ReflectionQuestion";
import "./AIReflectionPanel.css";

type AIReflectionPanelProps = {
  snapshot: ReflectionSessionSnapshot;
  onClose: () => void;
  onAnswerChange: (value: string) => void;
  onContinue: () => void;
  onRetry: () => void;
  onContinueWithoutAi: () => void;
  onBackToProcess: () => void;
  onExploreActivities: () => void;
  onSave: () => void;
};

function scopeLabel(scope: ReflectionSessionSnapshot["scope"]) {
  if (scope === "selected-section") return "Selected section";
  if (scope === "whole-process") return "Whole process";
  return "";
}

export function AIReflectionPanel({
  snapshot,
  onClose,
  onAnswerChange,
  onContinue,
  onRetry,
  onContinueWithoutAi,
  onBackToProcess,
  onExploreActivities,
  onSave,
}: AIReflectionPanelProps) {
  if (snapshot.stage === "CLOSED") return null;

  const generating =
    snapshot.stage === "GENERATING_QUESTION_1" ||
    snapshot.stage === "GENERATING_QUESTION_2";
  const asking =
    snapshot.stage === "QUESTION_1" || snapshot.stage === "QUESTION_2";
  const step =
    snapshot.stage === "QUESTION_2" ||
    snapshot.stage === "GENERATING_QUESTION_2"
      ? 2
      : 1;
  const question =
    snapshot.stage === "QUESTION_2" ||
    snapshot.stage === "GENERATING_QUESTION_2"
      ? snapshot.question2
      : snapshot.question1;
  const draft =
    snapshot.stage === "QUESTION_2" ? snapshot.answer2 : snapshot.answer1;
  const hasError = Boolean(snapshot.error);

  return (
    <div className="reflection-overlay" role="presentation">
      <section
        className="reflection-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reflection-panel-title"
        aria-busy={generating}
      >
        <header className="reflection-panel__header">
          <div className="reflection-panel__heading">
            <h2 id="reflection-panel-title" className="reflection-panel__title">
              AI Reflector
            </h2>
            <p className="reflection-panel__meta">
              {scopeLabel(snapshot.scope)}
              {snapshot.stage === "COMPLETE"
                ? " · Complete"
                : ` · Question ${step} of 2`}
            </p>
          </div>
          <button
            type="button"
            className="reflection-panel__close"
            aria-label="Close reflector"
            title="Close"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2.25} />
          </button>
        </header>

        <div className="reflection-panel__body">
          {generating && !hasError ? (
            <div className="reflection-loading" role="status">
              <span className="reflection-loading__dot" aria-hidden="true" />
              <p>
                {snapshot.stage === "GENERATING_QUESTION_1"
                  ? "Preparing a reflection question..."
                  : "Thinking about your response..."}
              </p>
            </div>
          ) : null}

          {hasError ? (
            <div className="reflection-error" role="alert">
              <p>{snapshot.error?.message}</p>
              <p className="reflection-error__hint">
                Your answers are kept. You can retry or continue with a prepared
                question.
              </p>
            </div>
          ) : null}

          {asking && question ? (
            <>
              <ReflectionQuestion question={question.question} step={step} />
              <ReflectionAnswerInput
                value={draft}
                onChange={onAnswerChange}
                disabled={snapshot.busy}
              />
            </>
          ) : null}

          {snapshot.stage === "COMPLETE" ? (
            <div className="reflection-complete">
              <p className="reflection-complete__lead">
                Reflection complete. Your wording is preserved below.
              </p>
              <div className="reflection-complete__block">
                <h3>My challenge</h3>
                <p>{snapshot.answer1.trim() || "—"}</p>
              </div>
              <div className="reflection-complete__block">
                <h3>What could help</h3>
                <p>{snapshot.answer2.trim() || "—"}</p>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="reflection-panel__footer">
          {hasError ? (
            <>
              <button
                type="button"
                className="reflection-panel__ghost"
                onClick={onClose}
              >
                Exit
              </button>
              {snapshot.error?.canFallback ? (
                <button
                  type="button"
                  className="reflection-panel__ghost"
                  onClick={onContinueWithoutAi}
                >
                  Continue without AI
                </button>
              ) : null}
              <button
                type="button"
                className="reflection-panel__primary"
                onClick={onRetry}
              >
                Retry
              </button>
            </>
          ) : null}

          {asking && !hasError ? (
            <>
              <button
                type="button"
                className="reflection-panel__ghost"
                onClick={onClose}
                disabled={snapshot.busy}
              >
                Exit
              </button>
              <button
                type="button"
                className="reflection-panel__primary"
                onClick={onContinue}
                disabled={snapshot.busy}
              >
                {snapshot.stage === "QUESTION_1" ? "Continue" : "Finish"}
              </button>
            </>
          ) : null}

          {generating && !hasError ? (
            <button
              type="button"
              className="reflection-panel__ghost"
              onClick={onClose}
            >
              Exit
            </button>
          ) : null}

          {snapshot.stage === "COMPLETE" ? (
            <>
              <button
                type="button"
                className="reflection-panel__ghost"
                onClick={onSave}
                disabled={snapshot.saved}
              >
                {snapshot.saved ? "Saved" : "Save reflection"}
              </button>
              <button
                type="button"
                className="reflection-panel__ghost"
                onClick={onBackToProcess}
              >
                Back to process
              </button>
              <button
                type="button"
                className="reflection-panel__primary"
                onClick={onExploreActivities}
              >
                Explore activities
              </button>
            </>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
