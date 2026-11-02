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
import { applyActivityFilters } from "../../recommendations/activityFilters";
import { readProcessContext } from "../../recommendations/processContext";
import { activityLayersFor } from "../../recommendations/radialGrouping";
import { phaseRgb, type Rgb } from "../../process/activityMotion";
import {
  MENU_CATEGORIES,
  TOKEN_CATALOG,
  type CatalogEntry,
  type MenuCategory,
} from "../../process/tokenCatalog";
import type { ProcessToken } from "../../process/processTypes";
import type { ScreenRect } from "../../exploration/cameraFocus";
import { explorationIndex } from "../../exploration/contextToken";
import { avoidProcessZone } from "../../exploration/exclusionZone";
import {
  EXPLORER_MOTION,
  prefersReducedMotion,
} from "../../exploration/explorerMotion";
import {
  IMMERSIVE_SCROLL,
  useImmersiveScroll,
} from "../../exploration/immersiveScroll";
import { outerPlateScale, plateScale } from "../../exploration/plateGrowth";
import { GRADIENT_VIEW } from "../../process/activityGradient";
import { placeCandidates } from "../../exploration/spatialLayout";
import { ActivityFilterPanel } from "../ActivityFilterPanel";
import { ExplorerDepthPlate } from "./ExplorerDepthPlate";
import {
  FloatingTokenScene,
  type ExplorerMotionHandle,
} from "./FloatingTokenScene";
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
  const token = compact ? 70 : mid ? 104 : 122;
  const clearance = center * 0.5 + token * 0.55 + (compact ? 20 : 36);
  const reachX = Math.min(
    Math.max(width * (compact ? 0.26 : 0.2), clearance / 0.7),
    width * 0.26,
    340,
  );
  const reachY = Math.min(
    Math.max(height * (short ? 0.12 : 0.18), clearance / 1.2),
    height * (short ? 0.16 : 0.26),
    short ? 160 : 280,
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
  const [query, setQuery] = useState("");
  const [phases, setPhases] = useState<PhaseId[]>([]);
  const wasOpen = useRef(open);
  const justOpened = open && !wasOpen.current;
  const [hintDismissed, setHintDismissed] = useState(false);
  if (justOpened && query !== "") setQuery("");
  if (justOpened && hintDismissed) setHintDismissed(false);
  wasOpen.current = open;

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
  const wash =
    frame.mode === "phase"
      ? SELECTOR_BLUE
      : frame.mode === "activity"
        ? activityWash.current
        : contextWash;
  const groupCount = layers.length;
  const resetKey =
    frame.mode === "activity" ? `activity|${filterKey}` : frame.mode;
  const scrollSpan = Math.max(0, groupCount - 1);
  const { nudge, subscribe, settle } = useImmersiveScroll(
    scrollSpan,
    open,
    resetKey,
  );
  const metrics = useViewportMetrics(host);
  const reachX =
    frame.mode === "phase"
      ? Math.min(metrics.reachX, metrics.reachY)
      : metrics.reachX;
  const reachY =
    frame.mode === "phase"
      ? Math.min(metrics.reachX, metrics.reachY)
      : metrics.reachY;
  const anchor = { x: metrics.width * 0.5, y: metrics.height * 0.5 };
  const settled = useMemo(
    () =>
      avoidProcessZone(candidates, zones, {
        anchorX: anchor.x,
        anchorY: anchor.y,
        reachX,
        reachY,
        tokenSize: metrics.token,
      }),
    [anchor.x, anchor.y, candidates, metrics.token, reachX, reachY, zones],
  );
  const coreRef = useRef<SVGGElement>(null);
  const outerRef = useRef<SVGGElement>(null);
  const breathRef = useRef<HTMLDivElement>(null);
  const hintIconRef = useRef<HTMLSpanElement>(null);
  const motionRef = useRef<ExplorerMotionHandle>(null);
  const showHint =
    open &&
    !hintDismissed &&
    scrollSpan > 0 &&
    EXPLORER_MOTION.hint.enabled;
  const reveal = useRef(0);
  const scrollSpanRef = useRef(scrollSpan);
  scrollSpanRef.current = scrollSpan;

  function choose(entry: CatalogEntry) {
    onPick(entry);
    if (entry.type === "phase") onMode("activity");
  }

  useEffect(() => {
    const canvas = document.querySelector(".canvas");
    if (!(canvas instanceof HTMLElement)) return;
    if (open) canvas.setAttribute("inert", "");
    else canvas.removeAttribute("inert");
    return () => canvas.removeAttribute("inert");
  }, [open]);

  const modeRef = useRef(frame.mode);
  modeRef.current = frame.mode;
  const onModeRef = useRef(onMode);
  onModeRef.current = onMode;
  const sectionPan = useRef({ x: 0, at: 0, lock: 0 });

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
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        event.preventDefault();
        const now = performance.now();
        const pan = sectionPan.current;
        if (now < pan.lock) return;
        if (now - pan.at > 320) pan.x = 0;
        pan.at = now;
        pan.x += dx;
        if (Math.abs(pan.x) < 72) return;
        const next = pan.x > 0 ? "activity" : "phase";
        pan.x = 0;
        pan.lock = now + 480;
        if (modeRef.current !== next) onModeRef.current(next);
        motionRef.current?.notePointer();
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".activity-filter, .explorer-preview, .explorer-actions, .explorer-hub, .explorer-modes",
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
        Math.max(
          -IMMERSIVE_SCROLL.maxStep,
          dy * IMMERSIVE_SCROLL.wheelGain,
        ),
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
            ".float-token, .activity-filter, .explorer-hub, .explorer-modes, .explorer-history, .explorer-actions, .explorer-token-card",
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
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) {
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
    motionRef.current?.playOpeningTeaser();
  }, [open, atmosphere]);

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
    if (
      !showHint ||
      !EXPLORER_MOTION.hint.enabled ||
      prefersReducedMotion()
    ) {
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
    setPhases((current) =>
      current.includes(phase)
        ? current.filter((item) => item !== phase)
        : [...current, phase],
    );
  }

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
      aria-label={
        frame.mode === "phase"
          ? "Choose a phase"
          : frame.mode === "checkpoint"
            ? "Choose a checkpoint"
            : "Choose an activity"
      }
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
        tokenSize={metrics.token}
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
      <div className="explorer-ui">
        <div className="explorer-hub">
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
          {frame.mode === "activity" ? (
            <ActivityFilterPanel
              open={open}
              collapsible
              embedded
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
        </div>
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
          <span className="explorer-hint__icon" ref={hintIconRef} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15">
              <rect x="7" y="2.5" width="10" height="19" rx="5" />
              <path d="M12 7v3.2" />
            </svg>
          </span>
          Scroll to explore more tokens
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
    const fade = Number.parseFloat(token.style.getPropertyValue("--fade") || "0");
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
