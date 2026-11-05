import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { Redo2, Undo2 } from "lucide-react";
import { ACTIVITY_REGISTRY } from "../../data/activityRegistry";
import type { PhaseId } from "../../data/phasePalette";
import {
  applyActivityFilters,
  PHASE_FILTERS,
} from "../../recommendations/activityFilters";
import { searchTokenLibrary } from "../../recommendations/tokenSearch";
import { readProcessContext } from "../../recommendations/processContext";
import { activityLayersFor } from "../../recommendations/radialGrouping";
import { phaseRgb, type Rgb } from "../../process/activityMotion";
import {
  TOKEN_CATALOG,
  type CatalogEntry,
  type MenuCategory,
} from "../../process/tokenCatalog";
import type { ProcessToken } from "../../process/processTypes";
import type { ScreenRect } from "../../exploration/cameraFocus";
import { explorationIndex } from "../../exploration/contextToken";
import { fitActivityCircle } from "../../exploration/exclusionZone";
import {
  activityScrollMax,
  activityScrollSpan,
  IMMERSIVE_DEPTH,
  poseAtDepth,
} from "../../exploration/depthPose";
import {
  EXPLORER_MOTION,
  prefersReducedMotion,
} from "../../exploration/explorerMotion";
import {
  IMMERSIVE_SCROLL,
  useImmersiveScroll,
} from "../../exploration/immersiveScroll";
import {
  outerPlateScale,
  plateOuterRadius,
  plateScale,
  plateStrokeRadius,
} from "../../exploration/plateGrowth";
import { GRADIENT_VIEW } from "../../process/activityGradient";
import {
  evenRingSpacing,
  placeCandidates,
} from "../../exploration/spatialLayout";
import {
  ActivityFilterPanel,
  PhaseFilterPill,
} from "../ActivityFilterPanel";
import { ExplorerDepthPlate } from "./ExplorerDepthPlate";
import {
  FloatingTokenScene,
  type ExplorerMotionHandle,
} from "./FloatingTokenScene";
import { PersistentPhaseArc } from "./PersistentPhaseArc";
import "./ImmersiveTokenExplorer.css";

const EMPTY_ZONES: ScreenRect[] = [];

/** Phase-selector rings. Distinct from the Understand token blue. */
const SELECTOR_BLUE: Rgb = { r: 0x08, g: 0x27, b: 0xe9 };

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
  atmosphere?: number;
  zones?: ScreenRect[];
  atmosphereHost?: HTMLElement | null;
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
  // Radar base: inner tokens are 130px on desktop (middle 100, outer 90).
  const token = 130 * (compact ? 0.62 : mid ? 0.82 : 1);
  const clearance = center * 0.42 + token * 0.5 + (compact ? 16 : 28);
  const reachX = Math.min(
    Math.max(width * (compact ? 0.34 : 0.32), clearance / 0.55),
    width * 0.42,
    compact ? 320 : 520,
  );
  const reachY = Math.min(
    Math.max(height * (short ? 0.3 : 0.4), clearance / 0.7),
    height * (short ? 0.44 : 0.48),
    short ? 320 : 440,
  );
  const orbit = Math.min(reachX, reachY);
  return {
    center,
    token,
    reachX: orbit,
    reachY: orbit,
    anchor: short ? "36%" : "46%",
  };
}

function hasPhaseToken(tokens: ProcessToken[]) {
  return tokens.some((token) => token.type === "phase");
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
  atmosphere = 0,
  zones = EMPTY_ZONES,
  atmosphereHost = null,
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

  // Separate explorer UI states — never merged.
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPhaseFilters, setSelectedPhaseFilters] = useState<PhaseId[]>(
    [],
  );

  const wasOpen = useRef(open);
  const justOpened = open && !wasOpen.current;
  const [hintDismissed, setHintDismissed] = useState(false);
  if (justOpened && searchQuery !== "") setSearchQuery("");
  if (justOpened && hintDismissed) setHintDismissed(false);
  wasOpen.current = open;

  const processStarted = hasPhaseToken(frame.tokens);
  const phaseOnly = open && !processStarted;
  const unified = open && processStarted && frame.mode !== "checkpoint";
  const searching = searchQuery.trim().length > 0 && unified;

  const index = explorationIndex(
    frame.tokens,
    frame.insertionIndex,
    frame.replaceId,
  );
  const contextPhase = readProcessContext(
    frame.tokens,
    index,
    ACTIVITY_REGISTRY,
  ).activePhase;
  const trackedPhase = useRef<PhaseId | null>(null);
  const trackingUnified = useRef(false);
  if (unified && contextPhase) {
    const phaseChanged = trackedPhase.current !== contextPhase;
    if (justOpened || !trackingUnified.current || phaseChanged) {
      trackedPhase.current = contextPhase;
      if (
        selectedPhaseFilters.length !== 1 ||
        selectedPhaseFilters[0] !== contextPhase
      ) {
        setSelectedPhaseFilters([contextPhase]);
      }
    }
  }
  trackingUnified.current = unified;

  // Manual phase filters drive the radar. Search ignores them while active.
  const visibleActivities = useMemo(() => {
    if (phaseOnly || frame.mode === "checkpoint") return [];
    if (searching) return [];
    return applyActivityFilters(ACTIVITY_REGISTRY, {
      query: "",
      phases: selectedPhaseFilters,
    });
  }, [phaseOnly, frame.mode, searching, selectedPhaseFilters]);

  const searchHits = useMemo(
    () => (searching ? searchTokenLibrary(searchQuery) : []),
    [searching, searchQuery],
  );

  const filterKey = selectedPhaseFilters.join(",");
  const activityLayers = useRef(
    activityLayersFor(
      frame.tokens,
      index,
      visibleActivities,
      selectedPhaseFilters,
    ).layers,
  );
  const sceneMode = useRef(frame.mode);
  const sceneFilter = useRef(filterKey);
  const sceneWasOpen = useRef(false);
  const sceneSearching = useRef(false);
  const refreshActivities =
    unified &&
    !searching &&
    (activityLayers.current.length === 0 ||
      sceneMode.current !== "activity" ||
      sceneFilter.current !== filterKey ||
      sceneSearching.current ||
      (open && !sceneWasOpen.current));
  if (refreshActivities) {
    activityLayers.current = activityLayersFor(
      frame.tokens,
      index,
      visibleActivities,
      selectedPhaseFilters,
    ).layers;
  }
  sceneMode.current = unified ? "activity" : frame.mode;
  sceneFilter.current = filterKey;
  sceneWasOpen.current = open;
  sceneSearching.current = searching;

  const searchLayers = useMemo(() => {
    if (!searching) return [];
    // Phases stay on the persistent outer arc — avoid duplicating them here.
    const results = searchHits.filter((hit) => hit.type !== "phase");
    // Stable relevance rings — not contextual ranking seats.
    const capacity = 10;
    const rings: CatalogEntry[][] = [];
    for (let i = 0; i < results.length; i += capacity) {
      rings.push(results.slice(i, i + capacity));
    }
    return rings;
  }, [searching, searchHits]);

  const phaseLayers = useMemo(() => [TOKEN_CATALOG.phase], []);
  const checkpointLayers = useMemo(() => [TOKEN_CATALOG.checkpoint], []);

  const layers = phaseOnly
    ? phaseLayers
    : frame.mode === "checkpoint"
      ? checkpointLayers
      : searching
        ? searchLayers
        : activityLayers.current;

  const candidates = useMemo(() => placeCandidates(layers), [layers]);
  // Blue wash is only for the initial phase picker. Once the process has a
  // phase, the radar uses that process phase's colour — not the selector blue.
  const processWash = phaseRgb(
    readProcessContext(frame.tokens, index, ACTIVITY_REGISTRY).activePhase,
  );
  const wash = phaseOnly ? SELECTOR_BLUE : processWash;
  const groupCount = layers.length;
  const resetKey = phaseOnly
    ? "phase-only"
    : searching
      ? `search|${searchQuery.trim()}`
      : unified
        ? `unified|${filterKey}`
        : frame.mode;
  // Promote through every activity layer, then one more unit so the last
  // ring exits inward and vanishes. Phase-only keeps a fixed ring.
  const scrollSpan = activityScrollSpan(groupCount);
  const scrollMax = activityScrollMax(
    groupCount,
    !phaseOnly && frame.mode !== "checkpoint",
  );
  const { nudge, subscribe, settle } = useImmersiveScroll(
    scrollMax,
    open,
    resetKey,
  );
  const metrics = useViewportMetrics(host);
  const anchor = { x: metrics.width * 0.5, y: metrics.height * 0.5 };
  const orbit = Math.min(metrics.reachX, metrics.reachY);
  const radarOuter = plateOuterRadius(metrics.width, metrics.height);
  const phaseCircleRadius = plateStrokeRadius(
    metrics.width,
    metrics.height,
    0,
  );
  const fitted = useMemo(() => {
    if (unified || frame.mode === "activity") {
      return fitActivityCircle({
        width: metrics.width,
        height: metrics.height,
        anchorX: anchor.x,
        anchorY: anchor.y,
        zones: [],
        fullToken: metrics.token,
        fallbackReach: orbit,
        points: candidates,
        targetOuterRadius: radarOuter,
      });
    }
    if (phaseOnly || frame.mode === "phase") {
      // Sit the five phases on the innermost Figma stroke.
      const pose = poseAtDepth(0);
      const project =
        IMMERSIVE_DEPTH.perspective / (IMMERSIVE_DEPTH.perspective - pose.z);
      const target = plateStrokeRadius(metrics.width, metrics.height, 0);
      const reach = target / (pose.spread * project);
      return { reach, tokenSize: metrics.token };
    }
    return { reach: orbit, tokenSize: metrics.token };
  }, [
    anchor.x,
    anchor.y,
    candidates,
    frame.mode,
    metrics.height,
    metrics.token,
    metrics.width,
    orbit,
    phaseOnly,
    radarOuter,
    unified,
  ]);
  const reachX = fitted.reach;
  const reachY = fitted.reach;
  const tokenSize = fitted.tokenSize;
  const settled = useMemo(() => evenRingSpacing(candidates), [candidates]);
  const coreRef = useRef<SVGGElement>(null);
  const outerRef = useRef<SVGGElement>(null);
  const breathRef = useRef<HTMLDivElement>(null);
  const hintIconRef = useRef<HTMLSpanElement>(null);
  const motionRef = useRef<ExplorerMotionHandle>(null);
  const hintGeneration = useRef(resetKey);
  if (hintGeneration.current !== resetKey) {
    hintGeneration.current = resetKey;
    if (hintDismissed) setHintDismissed(false);
  }
  const showHint =
    open &&
    unified &&
    !searching &&
    scrollSpan > 2 &&
    !hintDismissed &&
    EXPLORER_MOTION.hint.enabled;
  const reveal = useRef(0);
  const scrollSpanRef = useRef(scrollSpan);
  const scrollMaxRef = useRef(scrollMax);
  scrollSpanRef.current = scrollSpan;
  scrollMaxRef.current = scrollMax;

  function choose(entry: CatalogEntry) {
    onPick(entry);
    if (entry.type === "phase" && !processStarted) onMode("activity");
  }

  useEffect(() => {
    const canvas = document.querySelector(".canvas");
    if (!(canvas instanceof HTMLElement)) return;
    if (open) canvas.setAttribute("inert", "");
    else canvas.removeAttribute("inert");
    return () => canvas.removeAttribute("inert");
  }, [open]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !open) return;

    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) return;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? window.innerHeight
            : 1;
      const dy = event.deltaY * unit;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".activity-filter, .global-token-search, .explorer-preview, .explorer-actions, .explorer-hub, .explorer-phase-filters",
        )
      ) {
        return;
      }
      event.preventDefault();
      nudge(dy);
      motionRef.current?.noteScroll();
      if (scrollSpanRef.current > 0) return;
      const step = Math.min(
        IMMERSIVE_SCROLL.maxStep,
        Math.max(-IMMERSIVE_SCROLL.maxStep, dy * IMMERSIVE_SCROLL.wheelGain),
      );
      reveal.current = Math.min(1, Math.max(0, reveal.current + step / 1.45));
    }

    node.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => node.removeEventListener("wheel", onWheel, { capture: true });
  }, [open, nudge]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !open) return;

    let start: { x: number; y: number; dismiss: boolean } | null = null;

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      motionRef.current?.notePointer();
      const target = event.target;
      const onControl =
        target instanceof Element &&
        Boolean(
          target.closest(
            ".float-token, .activity-filter, .global-token-search, .explorer-hub, .explorer-phase-filters, .explorer-history, .explorer-actions, .explorer-token-card, .explorer-phase-arc",
          ),
        );
      start = {
        x: event.clientX,
        y: event.clientY,
        dismiss:
          !onControl &&
          !pointInRadar(event.clientX, event.clientY) &&
          (pointOnProcess(event.clientX, event.clientY) ||
            !pointInGradient(event.clientX, event.clientY)),
      };
    }

    function onPointerUp(event: PointerEvent) {
      const gesture = start;
      start = null;
      if (!gesture?.dismiss) return;
      if (
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5
      ) {
        return;
      }
      onClose();
    }

    node.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || atmosphere < 1) return;
    if (phaseOnly) return;
    motionRef.current?.playOpeningTeaser();
  }, [open, atmosphere, phaseOnly]);

  useLayoutEffect(() => {
    const node = breathRef.current;
    if (!node) return;
    if (!open || !EXPLORER_MOTION.breath.enabled || prefersReducedMotion()) {
      gsap.set(node, { clearProps: "transform,opacity" });
      return;
    }
    const tween = gsap.fromTo(
      node,
      {
        scale: EXPLORER_MOTION.breath.minScale,
        opacity: EXPLORER_MOTION.breath.maxOpacity,
      },
      {
        scale: EXPLORER_MOTION.breath.maxScale,
        opacity: EXPLORER_MOTION.breath.minOpacity,
        duration: EXPLORER_MOTION.breath.duration,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        force3D: true,
        transformOrigin: "50% 50%",
      },
    );
    return () => {
      tween.kill();
      gsap.set(node, { clearProps: "transform,opacity" });
    };
  }, [open, atmosphereHost]);

  useLayoutEffect(() => {
    const icon = hintIconRef.current;
    if (!icon) return;
    if (!showHint || !EXPLORER_MOTION.hint.enabled || prefersReducedMotion()) {
      gsap.set(icon, { clearProps: "transform" });
      return;
    }
    const tween = gsap.to(icon, {
      y: EXPLORER_MOTION.hint.travel,
      duration: EXPLORER_MOTION.hint.duration,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      force3D: true,
    });
    return () => {
      tween.kill();
      gsap.set(icon, { clearProps: "transform" });
    };
  }, [showHint]);

  useLayoutEffect(() => {
    const core = coreRef.current;
    const outer = outerRef.current;
    if (!core || !outer || !open) return;
    reveal.current = 0;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const unsubscribe = subscribe((progress) => {
      const span = scrollSpanRef.current;
      const max = scrollMaxRef.current;
      if (max <= 0) return;
      // Plate growth follows activity promotion; clamp during the exit overshoot.
      reveal.current = span <= 0 ? 1 : Math.min(1, progress / span);
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
      const accel =
        omega * omega * (destination - current) - 2 * zeta * omega * velocity;
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
      const nextCore = spring(
        coreScale,
        coreVelocity,
        coreTarget,
        11,
        0.52,
        dt,
      );
      const nextOuter = spring(
        outerScale,
        outerVelocity,
        outerTarget,
        6.5,
        0.8,
        dt,
      );
      coreScale = nextCore.scale;
      coreVelocity = nextCore.velocity;
      outerScale = nextOuter.scale;
      outerVelocity = nextOuter.velocity;
      if (
        Math.abs(coreTarget - coreScale) < 0.0004 &&
        Math.abs(coreVelocity) < 0.0004
      ) {
        coreScale = coreTarget;
        coreVelocity = 0;
      }
      if (
        Math.abs(outerTarget - outerScale) < 0.0004 &&
        Math.abs(outerVelocity) < 0.0004
      ) {
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
    setSelectedPhaseFilters((current) =>
      current.includes(phase)
        ? current.filter((item) => item !== phase)
        : [...current, phase],
    );
  }

  const ariaLabel = phaseOnly
    ? "Choose a phase"
    : frame.mode === "checkpoint"
      ? "Choose a checkpoint"
      : searching
        ? "Search tokens"
        : "Choose a token";

  return createPortal(
    <div
      ref={setRoot}
      className={
        open
          ? "immersive-explorer immersive-explorer--open"
          : "immersive-explorer"
      }
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      style={{
        ["--center" as string]: `${metrics.center}px`,
        ["--anchor-x" as string]: `${anchor.x}px`,
        ["--anchor-y" as string]: `${anchor.y}px`,
        ["--atmosphere" as string]: atmosphere,
        ["--wash" as string]: `${wash.r}, ${wash.g}, ${wash.b}`,
      }}
    >
      {atmosphereHost
        ? createPortal(
            <div
              className="explorer-atmosphere-anchor"
              style={{
                ["--anchor-x" as string]: `${anchor.x}px`,
                ["--anchor-y" as string]: `${anchor.y}px`,
              }}
            >
              <div className="explorer-plate-breath" ref={breathRef}>
                <ExplorerDepthPlate
                  color={wash}
                  coreRef={coreRef}
                  outerRef={outerRef}
                />
              </div>
            </div>,
            atmosphereHost,
          )
        : null}
      <FloatingTokenScene
        ref={motionRef}
        active={open}
        candidates={settled}
        reachX={reachX}
        reachY={reachY}
        tokenSize={tokenSize}
        anchorX={anchor.x}
        anchorY={anchor.y}
        zones={zones}
        subscribe={subscribe}
        settle={settle}
        onPick={choose}
        onUserScroll={() => {
          if (scrollSpanRef.current > 0) setHintDismissed(true);
        }}
        viewport={host}
      />
      <PersistentPhaseArc
        active={unified && !searching}
        anchorX={anchor.x}
        anchorY={anchor.y}
        radius={radarOuter}
        circleRadius={phaseCircleRadius}
        tokenSize={metrics.token}
        width={metrics.width}
        height={metrics.height}
        scrollSpan={scrollMax}
        subscribe={subscribe}
        onPick={choose}
      />
      <div className="explorer-ui">
        {unified ? (
          <ActivityFilterPanel
            open={open}
            global
            viewport={host}
            query={searchQuery}
            phases={selectedPhaseFilters}
            empty={
              searching
                ? searchHits.length === 0
                : visibleActivities.length === 0
            }
            onQuery={setSearchQuery}
            onTogglePhase={togglePhase}
            onClear={() => setSelectedPhaseFilters([])}
          />
        ) : null}
        {unified && !searching ? (
          <div className="explorer-hub">
            <div
              className="explorer-phase-filters"
              role="group"
              aria-label="Filter activities by phase"
            >
              {PHASE_FILTERS.map((phase) => (
                <PhaseFilterPill
                  key={phase.id}
                  id={phase.id}
                  label={phase.label}
                  color={phase.color}
                  pressed={selectedPhaseFilters.includes(phase.id)}
                  onToggle={togglePhase}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div className="explorer-actions">
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
          {addedCount > 0 ? (
            <p className="explorer-added" aria-live="polite">
              {addedCount === 1
                ? "1 token added"
                : `${addedCount} tokens added`}
            </p>
          ) : null}
        </div>
        <p
          className="explorer-hint"
          data-hidden={showHint ? "false" : "true"}
          aria-hidden={showHint ? undefined : true}
        >
          <span
            className="explorer-hint__icon"
            ref={hintIconRef}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" width="15" height="15">
              <rect x="7" y="2.5" width="10" height="19" rx="5" />
              <path d="M12 7v3.2" />
            </svg>
          </span>
          Scroll to explore more activities
        </p>
      </div>
    </div>,
    document.body,
  );
}

function pointInside(element: Element, x: number, y: number) {
  const box = element.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return false;
  const dx = (x - (box.left + box.width / 2)) / (box.width / 2);
  const dy = (y - (box.top + box.height / 2)) / (box.height / 2);
  return dx * dx + dy * dy <= 1;
}

function pointOnProcess(x: number, y: number) {
  const tokens = document.querySelectorAll(".process-token");
  for (const token of tokens) {
    if (!(token instanceof HTMLElement)) continue;
    const shift = token.closest(".process-token-shift");
    if (shift instanceof HTMLElement) {
      const opacity = Number.parseFloat(getComputedStyle(shift).opacity);
      if (Number.isFinite(opacity) && opacity <= 0.4) continue;
    }
    const art = token.querySelector("img") ?? token;
    if (pointInside(art, x, y)) return true;
  }
  return false;
}

function pointInGradient(x: number, y: number) {
  const circles = document.querySelectorAll(".explorer-plate circle");
  for (const circle of circles) {
    if (pointInside(circle, x, y)) return true;
  }
  return false;
}

function pointInRadar(x: number, y: number) {
  const tokens = document.querySelectorAll(".immersive-explorer .float-token");
  for (const token of tokens) {
    if (!(token instanceof HTMLElement)) continue;
    const fade = Number.parseFloat(
      token.style.getPropertyValue("--fade") || "0",
    );
    if (fade < 0.2) continue;
    if (pointInside(token, x, y)) return true;
  }
  return false;
}

function useViewportMetrics(node: HTMLElement | null) {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: Math.max(320, window.innerHeight - 72),
  }));

  useLayoutEffect(() => {
    if (!node) return;
    const read = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width < 1 || height < 1) return;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return {
    ...sceneMetrics(size.width, size.height),
    width: size.width,
    height: size.height,
  };
}
