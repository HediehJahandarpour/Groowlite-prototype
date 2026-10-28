import { useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { ACTIVITY_REGISTRY, activityById } from "../data/activityRegistry";
import { PHASE_IDS, PHASE_LABEL, type PhaseId } from "../data/phasePalette";
import { activityLayersFor, layerOf } from "../recommendations/radialGrouping";
import { purposeSummary } from "../recommendations/rankingEngine";
import { RECOMMENDATION_WEIGHTS } from "../recommendations/recommendationConfig";
import type { ProcessToken } from "../process/processTypes";
import "./RecommendationDebug.css";

type RecommendationDebugProps = {
  tokens: ProcessToken[];
  insertionIndex: number;
  onClose: () => void;
};

function stopPointer(event: ReactPointerEvent) {
  event.stopPropagation();
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

function phaseLine(scores: Record<PhaseId, number>, source: string): string {
  const parts = PHASE_IDS.filter((phase) => scores[phase] > 0).map(
    (phase) => `${PHASE_LABEL[phase]} ${formatScore(scores[phase])}`,
  );
  const body = parts.length > 0 ? parts.join(", ") : "none";
  return `${body} · ${source}`;
}

export function RecommendationDebug({ tokens, insertionIndex, onClose }: RecommendationDebugProps) {
  const view = useMemo(() => {
    const { context, ranked, ordered, layers } = activityLayersFor(tokens, insertionIndex);
    const scoreById = new Map(ranked.map((item) => [item.activityId, item]));
    return { context, ordered, scoreById, layers, layersById: layerOf(layers) };
  }, [tokens, insertionIndex]);

  const { context, ordered, scoreById, layers, layersById } = view;
  const weights = RECOMMENDATION_WEIGHTS;

  return (
    <aside
      className="recommend-debug"
      aria-label="Recommendation debug"
      onPointerDown={stopPointer}
    >
      <header className="recommend-debug__header">
        <h2>Recommendation debug</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <dl className="recommend-debug__facts">
        <div>
          <dt>Active phase</dt>
          <dd>{context.activePhase ? PHASE_LABEL[context.activePhase] : "None (neutral)"}</dd>
        </div>
        <div>
          <dt>Insertion index</dt>
          <dd>{context.insertionIndex}</dd>
        </div>
        <div>
          <dt>Previous activity</dt>
          <dd>{context.previousActivity?.label ?? "None"}</dd>
        </div>
        <div>
          <dt>Nearby context</dt>
          <dd>
            {context.precedingActivities.map((item) => item.label).join(" ← ") || "None"}
            {context.nextToken ? ` · next: ${context.nextToken.label}` : ""}
            {context.nearbyCheckpoint ? " · checkpoint nearby" : ""}
          </dd>
        </div>
        <div>
          <dt>Registered / ranked / layers</dt>
          <dd>
            {ACTIVITY_REGISTRY.length} / {ordered.length} / {layers.length}
          </dd>
        </div>
        <div>
          <dt>Weights</dt>
          <dd>
            phase {formatScore(weights.phaseWeight)} · context {formatScore(weights.contextWeight)} · workflow{" "}
            {formatScore(weights.workflowWeight)}
          </dd>
        </div>
      </dl>
      <ol className="recommend-debug__list">
        {ordered.map((item, index) => {
          const activity = activityById(item.activityId);
          const score = scoreById.get(item.activityId);
          if (!activity || !score) return null;
          const layer = layersById.get(activity.id);
          return (
            <li key={activity.id}>
              <div className="recommend-debug__title">
                <span>
                  {index + 1}. {activity.label}
                </span>
                <span>Layer {(layer ?? 0) + 1}</span>
              </div>
              <p>{phaseLine(activity.phaseAssociations, activity.associationSource)}</p>
              <p>Purpose: {purposeSummary(activity)}</p>
              <p className="recommend-debug__scores">
                phase {formatScore(score.phaseScore)} · context {formatScore(score.contextScore)} · workflow{" "}
                {formatScore(score.workflowScore)} · total {formatScore(score.totalScore)} · {score.metadataConfidence}
              </p>
              <p>{score.explanation}</p>
              {activity.predecessors.length > 0 ? (
                <p className="recommend-debug__links">
                  Follows{" "}
                  {activity.predecessors
                    .map((id) => activityById(id)?.label ?? id)
                    .join(", ")}
                  .
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
