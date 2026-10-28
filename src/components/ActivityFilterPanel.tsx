import {
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import searchIcon from "../assets/activity-search.svg";
import { PHASE_FILTERS } from "../recommendations/activityFilters";
import type { PhaseId } from "../data/phasePalette";
import "./ActivityFilterPanel.css";

type ActivityFilterPanelProps = {
  open: boolean;
  viewport: HTMLElement | null;
  query: string;
  phases: readonly PhaseId[];
  empty: boolean;
  onQuery: (value: string) => void;
  onTogglePhase: (phase: PhaseId) => void;
  onClear: () => void;
};

function stopCanvas(event: ReactPointerEvent | ReactWheelEvent) {
  event.stopPropagation();
}

export function ActivityFilterPanel({
  open,
  viewport,
  query,
  phases,
  empty,
  onQuery,
  onTogglePhase,
  onClear,
}: ActivityFilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const filtersActive = query.trim().length > 0 || phases.length > 0;

  useLayoutEffect(() => {
    if (!open || !viewport) return;
    const panel = panelRef.current;
    function blockWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
    }
    panel?.addEventListener("wheel", blockWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      panel?.removeEventListener("wheel", blockWheel, { capture: true });
    };
  }, [open, viewport]);

  if (!open || !viewport) return null;

  return createPortal(
    <aside
      ref={panelRef}
      className="activity-filter"
      aria-label="Search and filter activities"
      onPointerDown={stopCanvas}
      onWheel={stopCanvas}
    >
      <ActivitySearchInput query={query} onQuery={onQuery} />
      <div className="activity-filter__phases">
        <h2 className="activity-filter__heading" id="activity-filter-heading">
          Filter by Phases
        </h2>
        <div
          className="activity-filter__pills"
          role="group"
          aria-labelledby="activity-filter-heading"
        >
          {PHASE_FILTERS.map((phase) => (
            <PhaseFilterPill
              key={phase.id}
              id={phase.id}
              label={phase.label}
              color={phase.color}
              pressed={phases.includes(phase.id)}
              onToggle={onTogglePhase}
            />
          ))}
        </div>
      </div>
      {empty ? (
        <EmptyFilterResults onClear={onClear} />
      ) : filtersActive ? (
        <button
          type="button"
          className="activity-filter__clear"
          onClick={onClear}
        >
          Clear filters
        </button>
      ) : null}
    </aside>,
    viewport,
  );
}

export function ActivitySearchInput({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (value: string) => void;
}) {
  return (
    <label className="activity-filter__search">
      <img
        className="activity-filter__icon"
        src={searchIcon}
        alt=""
        width={16}
        height={16}
      />
      <input
        type="text"
        value={query}
        placeholder="Search tokens, keywords..."
        aria-label="Search tokens, keywords"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onQuery(event.target.value)}
      />
      {query.length > 0 ? (
        <button
          type="button"
          className="activity-filter__clear-search"
          aria-label="Clear search"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onQuery("")}
        >
          ×
        </button>
      ) : null}
    </label>
  );
}

export function PhaseFilterPill({
  id,
  label,
  color,
  pressed,
  onToggle,
}: {
  id: PhaseId;
  label: string;
  color: string;
  pressed: boolean;
  onToggle: (phase: PhaseId) => void;
}) {
  return (
    <button
      type="button"
      className="phase-pill"
      data-phase={id}
      style={{ ["--phase" as string]: color }}
      aria-pressed={pressed}
      onClick={() => onToggle(id)}
    >
      {label}
    </button>
  );
}

export function EmptyFilterResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="activity-filter__empty" role="status">
      <p>No matching activities found.</p>
      <button
        type="button"
        className="activity-filter__clear"
        onClick={onClear}
      >
        Clear filters
      </button>
    </div>
  );
}
