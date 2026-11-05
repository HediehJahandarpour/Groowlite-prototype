import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import searchIcon from "../assets/activity-search.svg";
import { PHASE_FILTERS } from "../recommendations/activityFilters";
import type { PhaseId } from "../data/phasePalette";
import "./ActivityFilterPanel.css";

type ActivityFilterPanelProps = {
  open: boolean;
  /** Starts as a search icon. The field and phase filters open from that icon. */
  collapsible?: boolean;
  /** Draw in place. The explorer centres this on the gradient instead of portaling it. */
  embedded?: boolean;
  /**
   * Top-centre global search bar.
   * Used by the unified immersive explorer.
   */
  global?: boolean;
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
  collapsible = false,
  embedded = false,
  global = false,
  viewport,
  query,
  phases,
  empty,
  onQuery,
  onTogglePhase,
  onClear,
}: ActivityFilterPanelProps) {
  if (global) {
    return <GlobalTokenSearch open={open} query={query} onQuery={onQuery} />;
  }

  return (
    <LegacyActivityFilterPanel
      open={open}
      collapsible={collapsible}
      embedded={embedded}
      viewport={viewport}
      query={query}
      phases={phases}
      empty={empty}
      onQuery={onQuery}
      onTogglePhase={onTogglePhase}
      onClear={onClear}
    />
  );
}

function GlobalTokenSearch({
  open,
  query,
  onQuery,
}: {
  open: boolean;
  query: string;
  onQuery: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    function blockWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
    }
    root.addEventListener("wheel", blockWheel, { passive: false, capture: true });
    return () => {
      root.removeEventListener("wheel", blockWheel, { capture: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <aside
      ref={rootRef}
      className="global-token-search"
      aria-label="Search all tokens"
      onPointerDown={stopCanvas}
      onWheel={stopCanvas}
    >
      <div className="global-token-search__bar">
        <img
          className="global-token-search__icon"
          src={searchIcon}
          alt=""
          width={18}
          height={18}
        />
        <input
          type="text"
          value={query}
          placeholder="Search all tokens..."
          aria-label="Search all tokens"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onQuery(event.target.value)}
        />
        {query.length > 0 ? (
          <button
            type="button"
            className="global-token-search__clear"
            aria-label="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onQuery("")}
          >
            ×
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function LegacyActivityFilterPanel({
  open,
  collapsible = false,
  embedded = false,
  viewport,
  query,
  phases,
  empty,
  onQuery,
  onTogglePhase,
  onClear,
}: {
  open: boolean;
  collapsible?: boolean;
  embedded?: boolean;
  viewport: HTMLElement | null;
  query: string;
  phases: readonly PhaseId[];
  empty: boolean;
  onQuery: (value: string) => void;
  onTogglePhase: (phase: PhaseId) => void;
  onClear: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(!collapsible);
  const filtersActive = query.trim().length > 0 || phases.length > 0;
  const showBar = !collapsible || expanded;

  useEffect(() => {
    if (!open) setExpanded(!collapsible);
  }, [open, collapsible]);

  useEffect(() => {
    if (!collapsible || !expanded) return;
    panelRef.current?.querySelector("input")?.focus();
  }, [collapsible, expanded]);

  useEffect(() => {
    if (!collapsible || !expanded) return;
    function onPointerDown(event: PointerEvent) {
      const panel = panelRef.current;
      if (!panel || !(event.target instanceof Node) || panel.contains(event.target))
        return;
      if (filtersActive) return;
      setExpanded(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [collapsible, expanded, filtersActive]);

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

  if (!open || (!embedded && !viewport)) return null;

  const panel = (
    <aside
      ref={panelRef}
      className={
        showBar ? "activity-filter" : "activity-filter activity-filter--icon"
      }
      aria-label="Search and filter activities"
      onPointerDown={stopCanvas}
      onWheel={stopCanvas}
    >
      {showBar ? (
        <>
          <div className="activity-filter__row">
            <ActivitySearchInput query={query} onQuery={onQuery} />
            {collapsible ? (
              <button
                type="button"
                className="activity-filter__close"
                aria-label="Close search"
                onClick={() => setExpanded(false)}
              >
                <X size={16} strokeWidth={2.25} />
              </button>
            ) : null}
          </div>
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
        </>
      ) : (
        <button
          type="button"
          className="activity-filter__launch"
          aria-label="Search and filter"
          aria-expanded="false"
          onClick={() => setExpanded(true)}
        >
          <img src={searchIcon} alt="" width={18} height={18} />
        </button>
      )}
    </aside>
  );

  if (embedded || !viewport) return panel;
  return createPortal(panel, viewport);
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
