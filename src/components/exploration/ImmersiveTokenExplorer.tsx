import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { Redo2, Undo2 } from "lucide-react";
import { ACTIVITY_REGISTRY } from "../../data/activityRegistry";
import type { PhaseId } from "../../data/phasePalette";
import { applyActivityFilters } from "../../recommendations/activityFilters";
import { readProcessContext } from "../../recommendations/processContext";
import { activityLayersFor } from "../../recommendations/radialGrouping";
import { phaseRgb } from "../../process/activityMotion";
import {
  MENU_CATEGORIES,
  TOKEN_CATALOG,
  type CatalogEntry,
  type MenuCategory,
} from "../../process/tokenCatalog";
import type { ProcessToken } from "../../process/processTypes";
import { contextFocus, explorationIndex } from "../../exploration/contextToken";
import { IMMERSIVE_SCROLL, useImmersiveScroll } from "../../exploration/immersiveScroll";
import { outerPlateScale, plateScale } from "../../exploration/plateGrowth";
import { GRADIENT_VIEW } from "../../process/activityGradient";
import { placeCandidates } from "../../exploration/spatialLayout";
import { ActivityFilterPanel } from "../ActivityFilterPanel";
import { ExplorerDepthPlate } from "./ExplorerDepthPlate";
import { FloatingTokenScene } from "./FloatingTokenScene";
import { ProcessMiniPreview } from "./ProcessMiniPreview";
import "./ImmersiveTokenExplorer.css";

type ExplorerMode = MenuCategory;

type ImmersiveTokenExplorerProps = {
  open: boolean;
  mode: ExplorerMode;
  tokens: ProcessToken[];
  insertionIndex: number;
  replaceId: string | null;
  addedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onPick: (entry: CatalogEntry) => void;
  onMode: (mode: ExplorerMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
};

type Frame = {
  tokens: ProcessToken[];
  insertionIndex: number;
  replaceId: string | null;
  mode: ExplorerMode;
};

function sceneMetrics(width: number, height: number) {
  const compact = width < 760;
  const mid = width < 1100;
  const short = height < 780;
  const center = compact ? 112 : mid ? 188 : 232;
  const token = compact ? 70 : mid ? 104 : 122;
  const clearance = center * 0.5 + token * 0.55 + (compact ? 20 : 36);
  const reachX = Math.min(
    Math.max(width * (compact ? 0.36 : 0.3), clearance / 0.7),
    width * 0.42,
    500,
  );
  const reachY = Math.min(
    Math.max(height * (short ? 0.16 : 0.28), clearance / 1.2),
    height * (short ? 0.2 : 0.38),
    short ? 200 : 420,
  );
  return {
    center,
    token,
    reachX,
    reachY,
    anchor: short ? "36%" : "46%",
  };
}

export function ImmersiveTokenExplorer({
  open,
  mode,
  tokens,
  insertionIndex,
  replaceId,
  onPick,
  onMode,
  addedCount,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClose,
}: ImmersiveTokenExplorerProps) {
  const live: Frame = { tokens, insertionIndex, replaceId, mode };
  const frozen = useRef(live);
  if (open) frozen.current = live;
  const frame = open ? live : frozen.current;

  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setHost((current) => (current === node ? current : node));
  }, []);
  const [entered, setEntered] = useState(false);
  const [query, setQuery] = useState("");
  const [phases, setPhases] = useState<PhaseId[]>([]);
  const wasOpen = useRef(open);
  const justOpened = open && !wasOpen.current;
  if (justOpened && query !== "") setQuery("");
  wasOpen.current = open;

  const index = explorationIndex(
    frame.tokens,
    frame.insertionIndex,
    frame.replaceId,
  );
  const focus = contextFocus(frame.tokens, index);
  const contextPhase = readProcessContext(
    frame.tokens,
    index,
    ACTIVITY_REGISTRY,
  ).activePhase;
  const trackedPhase = useRef<PhaseId | null>(null);
  const trackingActivities = useRef(false);
  const onActivities = open && frame.mode === "activity";
  if (onActivities && contextPhase) {
    const phaseChanged = trackedPhase.current !== contextPhase;
    if (justOpened || !trackingActivities.current || phaseChanged) {
      trackedPhase.current = contextPhase;
      if (phases.length !== 1 || phases[0] !== contextPhase) {
        setPhases([contextPhase]);
      }
    }
  }
  trackingActivities.current = onActivities;
  const visibleActivities = useMemo(
    () =>
      frame.mode === "activity"
        ? applyActivityFilters(ACTIVITY_REGISTRY, { query, phases })
        : [],
    [frame.mode, query, phases],
  );
  const filterKey = `${query}|${phases.join(",")}`;
  const activityLayers = useRef(
    activityLayersFor(frame.tokens, index, visibleActivities, phases).layers,
  );
  const sceneMode = useRef(frame.mode);
  const sceneFilter = useRef(filterKey);
  const sceneWasOpen = useRef(false);
  const refreshActivities =
    frame.mode === "activity" &&
    (activityLayers.current.length === 0 ||
      sceneMode.current !== "activity" ||
      sceneFilter.current !== filterKey ||
      (open && !sceneWasOpen.current));
  if (refreshActivities) {
    activityLayers.current = activityLayersFor(
      frame.tokens,
      index,
      visibleActivities,
      phases,
    ).layers;
  }
  sceneMode.current = frame.mode;
  sceneFilter.current = filterKey;
  sceneWasOpen.current = open;
  const phaseLayers = useMemo(() => [TOKEN_CATALOG.phase], []);
  const checkpointLayers = useMemo(() => [TOKEN_CATALOG.checkpoint], []);
  const layers =
    frame.mode === "phase"
      ? phaseLayers
      : frame.mode === "checkpoint"
        ? checkpointLayers
        : activityLayers.current;
  const candidates = useMemo(() => placeCandidates(layers), [layers]);
  const contextWash = phaseRgb(
    phases.length === 1
      ? phases[0]
      : readProcessContext(frame.tokens, index, ACTIVITY_REGISTRY).activePhase,
  );
  const activityWash = useRef(contextWash);
  if (refreshActivities) activityWash.current = contextWash;
  const wash = frame.mode === "activity" ? activityWash.current : contextWash;
  const groupCount = layers.length;
  const resetKey =
    frame.mode === "activity" ? `activity|${filterKey}` : frame.mode;
  const scrollSpan = Math.max(0, groupCount - 1);
  const { nudge, subscribe, settle } = useImmersiveScroll(
    scrollSpan,
    open,
    resetKey,
  );
  const metrics = useViewportMetrics();
  const coreRef = useRef<SVGGElement>(null);
  const outerRef = useRef<SVGGElement>(null);
  const reveal = useRef(0);
  const scrollSpanRef = useRef(scrollSpan);
  scrollSpanRef.current = scrollSpan;

  function choose(entry: CatalogEntry) {
    onPick(entry);
    if (entry.type === "phase") onMode("activity");
  }

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    const shell = document.querySelector(".app-shell");
    if (!(shell instanceof HTMLElement)) return;
    if (open) shell.setAttribute("inert", "");
    else shell.removeAttribute("inert");
    return () => shell.removeAttribute("inert");
  }, [open]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !open) return;

    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".activity-filter, .explorer-preview, .explorer-actions, .explorer-modes",
        )
      ) {
        return;
      }
      event.preventDefault();
      const line =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? window.innerHeight
            : 1;
      nudge(event.deltaY * line);
      if (scrollSpanRef.current > 0) return;
      const step = Math.min(
        IMMERSIVE_SCROLL.maxStep,
        Math.max(
          -IMMERSIVE_SCROLL.maxStep,
          event.deltaY * line * IMMERSIVE_SCROLL.wheelGain,
        ),
      );
      reveal.current = Math.min(1, Math.max(0, reveal.current + step / 1.45));
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [open, nudge]);

  useLayoutEffect(() => {
    const core = coreRef.current;
    const outer = outerRef.current;
    if (!core || !outer || !open) return;
    reveal.current = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const unsubscribe = subscribe((progress) => {
      if (scrollSpanRef.current <= 0) return;
      reveal.current = progress / scrollSpanRef.current;
    });
    const pivot = GRADIENT_VIEW / 2;
    let coreScale = plateScale(0);
    let outerScale = outerPlateScale(0);
    let coreVelocity = 0;
    let outerVelocity = 0;

    const paint = (node: SVGGElement, value: number) => {
      node.setAttribute(
        "transform",
        `translate(${pivot} ${pivot}) scale(${value.toFixed(4)}) translate(${-pivot} ${-pivot})`,
      );
    };
    paint(core, coreScale);
    paint(outer, outerScale);

    const spring = (
      current: number,
      velocity: number,
      destination: number,
      omega: number,
      zeta: number,
      dt: number,
    ) => {
      const accel = omega * omega * (destination - current) - 2 * zeta * omega * velocity;
      const nextVelocity = velocity + accel * dt;
      return { scale: current + nextVelocity * dt, velocity: nextVelocity };
    };

    const tick = (_time: number, deltaMs: number) => {
      const coreTarget = plateScale(reveal.current);
      const outerTarget = outerPlateScale(reveal.current);
      if (reduced) {
        coreScale = coreTarget;
        outerScale = outerTarget;
        coreVelocity = 0;
        outerVelocity = 0;
        paint(core, coreScale);
        paint(outer, outerScale);
        return;
      }
      const dt = Math.min(0.05, (deltaMs || 16.7) / 1000);
      const nextCore = spring(coreScale, coreVelocity, coreTarget, 11, 0.52, dt);
      const nextOuter = spring(outerScale, outerVelocity, outerTarget, 6.5, 0.8, dt);
      coreScale = nextCore.scale;
      coreVelocity = nextCore.velocity;
      outerScale = nextOuter.scale;
      outerVelocity = nextOuter.velocity;
      if (Math.abs(coreTarget - coreScale) < 0.0004 && Math.abs(coreVelocity) < 0.0004) {
        coreScale = coreTarget;
        coreVelocity = 0;
      }
      if (Math.abs(outerTarget - outerScale) < 0.0004 && Math.abs(outerVelocity) < 0.0004) {
        outerScale = outerTarget;
        outerVelocity = 0;
      }
      paint(core, coreScale);
      paint(outer, outerScale);
    };

    gsap.ticker.add(tick);
    return () => {
      unsubscribe();
      gsap.ticker.remove(tick);
    };
  }, [open, subscribe, scrollSpan]);

  function togglePhase(phase: PhaseId) {
    setPhases((current) =>
      current.includes(phase)
        ? current.filter((item) => item !== phase)
        : [...current, phase],
    );
  }

  const hint =
    "Scroll to explore the tokens. Choose one to add it, or select Done.";

  return createPortal(
    <div
      ref={setRoot}
      className={
        entered && open
          ? "immersive-explorer immersive-explorer--open"
          : "immersive-explorer"
      }
      role="dialog"
      aria-modal="true"
      aria-label={
        frame.mode === "phase"
          ? "Choose a phase"
          : frame.mode === "checkpoint"
            ? "Choose a checkpoint"
            : "Choose an activity"
      }
      style={{
        ["--center" as string]: `${metrics.center}px`,
        ["--anchor-y" as string]: metrics.anchor,
        ["--wash" as string]: `${wash.r}, ${wash.g}, ${wash.b}`,
      }}
    >
      <div className="explorer-glass" />
      <ExplorerDepthPlate color={wash} coreRef={coreRef} outerRef={outerRef} />
      <div className="explorer-veil" />
      <FloatingTokenScene
        candidates={candidates}
        reachX={
          frame.mode === "phase"
            ? Math.min(metrics.reachX, metrics.reachY)
            : metrics.reachX
        }
        reachY={
          frame.mode === "phase"
            ? Math.min(metrics.reachX, metrics.reachY)
            : metrics.reachY
        }
        tokenSize={metrics.token}
        subscribe={subscribe}
        settle={settle}
        onPick={choose}
        onProgress={markScrolled}
        viewport={host}
      />
      {focus ? <CentralContextToken key={focus.id} focus={focus} /> : null}
      <div className="explorer-ui">
        <ProcessMiniPreview tokens={frame.tokens} focus={focus} />
        <p className="explorer-added" aria-live="polite">
          {addedCount === 1 ? "1 token added" : `${addedCount} tokens added`}
        </p>
        <div
          className="explorer-modes"
          role="group"
          aria-label="Token category"
        >
          {MENU_CATEGORIES.filter((item) => item.id !== "checkpoint").map(
            (item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={frame.mode === item.id}
                onClick={() => onMode(item.id)}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
        <div className="explorer-actions">
          <button type="button" className="explorer-done" onClick={onClose}>
            Done
          </button>
          <div className="explorer-history" aria-label="History">
            <button
              type="button"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Undo2 size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Redo2 size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
        <p className="explorer-hint">{hint}</p>
      </div>
      {frame.mode === "activity" ? (
        <ActivityFilterPanel
          open={open}
          collapsible
          viewport={host}
          query={query}
          phases={phases}
          empty={visibleActivities.length === 0}
          onQuery={setQuery}
          onTogglePhase={togglePhase}
          onClear={() => {
            setQuery("");
            setPhases([]);
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}

function CentralContextToken({
  focus,
}: {
  focus: { asset: string; label: string };
}) {
  return (
    <div className="explorer-anchor" role="img" aria-label={focus.label}>
      <img src={`/tokens/${focus.asset}`} alt="" draggable={false} />
    </div>
  );
}

function markScrolled(progress: number) {
  const root = document.querySelector(".immersive-explorer");
  if (!(root instanceof HTMLElement)) return;
  root.classList.toggle("is-scrolled", progress > 0.08);
}

function useViewportMetrics() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    function onResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return sceneMetrics(size.width, size.height);
}
