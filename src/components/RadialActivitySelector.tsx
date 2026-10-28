import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { ChevronUp } from "lucide-react";
import { activityInfoFor, bestForLabel } from "../data/activityInfo";
import { ACTIVITY_BY_ID, ACTIVITY_REGISTRY } from "../data/activityRegistry";
import type { PhaseId } from "../data/phasePalette";
import {
  applyActivityFilters,
  foldSearchText,
} from "../recommendations/activityFilters";
import { activityLayersFor } from "../recommendations/radialGrouping";
import { readProcessContext } from "../recommendations/processContext";
import { GRADIENT_VIEW } from "../process/activityGradient";
import {
  ACTIVITY_LAYOUT,
  FRONT_RING,
  phaseRgb,
  ringAngles,
  sampleRing,
} from "../process/activityMotion";
import type { CatalogEntry } from "../process/tokenCatalog";
import type { Point, ProcessToken } from "../process/processTypes";
import type { WorldBounds } from "../process/radialLayout";
import { ActivityFilterPanel } from "./ActivityFilterPanel";
import { RadialGradientLayers } from "./RadialGradientLayers";
import { useRadialScroll } from "./useRadialScroll";
import "./RadialActivitySelector.css";

type RadialActivitySelectorProps = {
  open: boolean;
  origin: Point;
  tokens: ProcessToken[];
  insertionIndex: number;
  gradientHost: HTMLDivElement | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  onPick: (entry: CatalogEntry) => void;
  onFit: (bounds: WorldBounds) => void;
};

type PlacedToken = {
  id: string;
  asset: string;
  label: string;
  layer: number;
  left: number;
  top: number;
  width: number;
  opacity: number;
  interactive: boolean;
  /** Selectable token sitting on the inner ring at full opacity. */
  info: boolean;
  side: "left" | "right";
};

type InfoAnchor = {
  id: string;
  label: string;
  element: HTMLButtonElement;
  prefer: "left" | "right";
};

function stopPointer(event: ReactPointerEvent) {
  event.stopPropagation();
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function RadialActivitySelector({
  open,
  origin,
  tokens,
  insertionIndex,
  gradientHost,
  viewportRef,
  onPick,
  onFit,
}: RadialActivitySelectorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedManualPhases, setSelectedManualPhases] = useState<PhaseId[]>(
    [],
  );
  const [departing, setDeparting] = useState<PlacedToken[]>([]);
  const placedRef = useRef<PlacedToken[]>([]);
  const wasOpen = useRef(open);
  if (
    open &&
    !wasOpen.current &&
    (searchQuery !== "" || selectedManualPhases.length > 0)
  ) {
    setSearchQuery("");
    setSelectedManualPhases([]);
  }
  wasOpen.current = open;

  const visibleActivities = useMemo(
    () =>
      applyActivityFilters(ACTIVITY_REGISTRY, {
        query: searchQuery,
        phases: selectedManualPhases,
      }),
    [searchQuery, selectedManualPhases],
  );
  const recommendation = useMemo(
    () =>
      activityLayersFor(
        tokens,
        insertionIndex,
        visibleActivities,
        selectedManualPhases,
      ),
    [tokens, insertionIndex, visibleActivities, selectedManualPhases],
  );
  const rings = recommendation.layers;
  const phase = useMemo(
    () =>
      readProcessContext(tokens, insertionIndex, ACTIVITY_REGISTRY).activePhase,
    [tokens, insertionIndex],
  );
  const manualKey = `${foldSearchText(searchQuery)}|${selectedManualPhases.slice().sort().join(",")}`;
  const resetKey = useMemo(
    () =>
      `${insertionIndex}|${tokens
        .map((token) => `${token.order}:${token.id}:${token.asset}`)
        .join("|")}|${manualKey}`,
    [tokens, insertionIndex, manualKey],
  );
  const { progress, nudge } = useRadialScroll(
    Math.max(0, rings.length - 1),
    open,
    resetKey,
  );
  const nextColor = phaseRgb(phase);
  const colorProxy = useRef(nextColor);
  const [color, setColor] = useState(colorProxy.current);
  const layoutKey = rings
    .map((ring) => ring.map((activity) => activity.id).join(","))
    .join("|");
  const latestPlaced = useRef<PlacedToken[]>([]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    if (reducedMotion()) {
      setEntered(true);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    const reduced = reducedMotion();
    const tween = gsap.to(colorProxy.current, {
      r: nextColor.r,
      g: nextColor.g,
      b: nextColor.b,
      duration: reduced ? 0 : 0.6,
      ease: "power2.inOut",
      onUpdate: () => setColor({ ...colorProxy.current }),
    });
    return () => {
      tween.kill();
    };
  }, [nextColor.r, nextColor.g, nextColor.b]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !open) return;

    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      nudge(event.deltaY);
    }

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [open, nudge]);

  const center = {
    x: origin.x + ACTIVITY_LAYOUT.center.x,
    y: origin.y + ACTIVITY_LAYOUT.center.y,
  };
  const half = ACTIVITY_LAYOUT.gradient / 2;

  useEffect(() => {
    if (!open) return;
    onFit({
      minX: Math.min(origin.x - 80, center.x - half),
      minY: center.y - half,
      maxX: center.x + half + 24,
      maxY: center.y + half,
    });
  }, [open, origin.x, origin.y, center.x, center.y, half, onFit]);

  const placements = useMemo(() => {
    const items: PlacedToken[] = [];
    rings.forEach((ring, ringIndex) => {
      const offset = ringIndex === 0 ? 0 : ringIndex - progress;
      const pose =
        ringIndex === 0
          ? { ...FRONT_RING, opacity: Math.max(0, 1 - Math.min(1, progress)) }
          : sampleRing(offset);
      const spin =
        ACTIVITY_LAYOUT.spins[ringIndex % ACTIVITY_LAYOUT.spins.length];
      const interactive = pose.opacity >= ACTIVITY_LAYOUT.hitOpacity;
      const scale = ACTIVITY_LAYOUT.gradient / GRADIENT_VIEW;
      const worldR = pose.r * scale;
      const angles = ringAngles(ring.length, spin);
      ring.forEach((entry, index) => {
        const angle = (angles[index] * Math.PI) / 180;
        const vx = pose.cx + Math.cos(angle) * (worldR / scale);
        const vy = pose.cy + Math.sin(angle) * (worldR / scale);
        const left = center.x + (vx - GRADIENT_VIEW / 2) * scale;
        const onFirstRing =
          pose.opacity >= 0.995 &&
          Math.abs(pose.cx - FRONT_RING.cx) < 0.5 &&
          Math.abs(pose.cy - FRONT_RING.cy) < 0.5 &&
          Math.abs(pose.r - FRONT_RING.r) < 0.5;
        items.push({
          id: entry.id,
          asset: entry.asset,
          label: entry.label,
          layer: ringIndex,
          left,
          top: center.y + (vy - GRADIENT_VIEW / 2) * scale,
          width: pose.size,
          opacity: pose.opacity,
          interactive,
          info: interactive && onFirstRing,
          side: left >= center.x ? "right" : "left",
        });
      });
    });
    return items;
  }, [rings, progress, center.x, center.y]);
  latestPlaced.current = placements;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!open) {
      placedRef.current = [];
      setDeparting((current) => (current.length === 0 ? current : []));
      return;
    }

    const previous = placedRef.current;
    const current = latestPlaced.current;
    const currentIds = new Set(current.map((item) => item.id));
    const gone = previous.filter((item) => !currentIds.has(item.id));
    setDeparting((showing) => {
      if (gone.length === 0 && showing.length === 0) return showing;
      return gone;
    });

    if (previous.length === 0 || !root || reducedMotion()) {
      return () => {
        if (!root) return;
        const nodes = root.querySelectorAll(".radial-activity__token");
        gsap.killTweensOf(nodes);
        gsap.set(nodes, { clearProps: "transform" });
      };
    }

    const buttons = root.querySelectorAll<HTMLButtonElement>(
      ".radial-activity__token:not(.radial-activity__token--leaving)",
    );
    buttons.forEach((button) => {
      const id = button.dataset.activity ?? "";
      const prev = previous.find((item) => item.id === id);
      const next = current.find((item) => item.id === id);
      if (!next) return;
      if (!prev) {
        gsap.fromTo(
          button,
          { xPercent: -50, yPercent: -50, scale: 0.86, opacity: 0 },
          {
            xPercent: -50,
            yPercent: -50,
            scale: 1,
            opacity: next.opacity,
            duration: 0.35,
            ease: "power2.out",
            overwrite: "auto",
            onComplete: () => gsap.set(button, { clearProps: "transform" }),
          },
        );
        return;
      }
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      gsap.fromTo(
        button,
        { xPercent: -50, yPercent: -50, x: dx, y: dy },
        {
          xPercent: -50,
          yPercent: -50,
          x: 0,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: () => gsap.set(button, { clearProps: "transform" }),
        },
      );
    });

    return () => {
      const nodes = root.querySelectorAll(".radial-activity__token");
      gsap.killTweensOf(nodes);
      gsap.set(nodes, { clearProps: "transform" });
    };
  }, [layoutKey, manualKey, open]);

  useLayoutEffect(() => {
    if (!open) return;
    placedRef.current = latestPlaced.current;
  });

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || departing.length === 0) return;
    if (reducedMotion()) {
      setDeparting([]);
      return;
    }
    const nodes = root.querySelectorAll(".radial-activity__token--leaving");
    const tween = gsap.to(nodes, {
      opacity: 0,
      duration: 0.28,
      ease: "power1.out",
      onComplete: () => setDeparting([]),
    });
    return () => {
      tween.kill();
    };
  }, [departing]);

  function togglePhase(phaseId: PhaseId) {
    setSelectedManualPhases((current) =>
      current.includes(phaseId)
        ? current.filter((item) => item !== phaseId)
        : [...current, phaseId],
    );
  }

  function clearFilters() {
    setSearchQuery("");
    setSelectedManualPhases([]);
  }

  const [info, setInfo] = useState<InfoAnchor | null>(null);

  useEffect(() => {
    if (!open) setInfo(null);
  }, [open]);

  useEffect(() => {
    if (!info) return;
    const current = placements.find((item) => item.id === info.id);
    if (!current?.info) setInfo(null);
  }, [placements, info]);

  function showInfo(element: HTMLButtonElement, entry: PlacedToken) {
    if (!entry.info) return;
    setInfo((current) =>
      current?.id === entry.id && current.element === element
        ? current
        : {
            id: entry.id,
            label: entry.label,
            element,
            prefer: entry.side,
          },
    );
  }

  function hideInfo(id: string) {
    setInfo((current) => (current?.id === id ? null : current));
  }

  const pulse = Math.sin((progress - Math.floor(progress)) * Math.PI);
  const visible = open && entered;
  const gradient = (
    <RadialGradientLayers
      center={center}
      size={ACTIVITY_LAYOUT.gradient}
      color={color}
      open={visible}
      pulse={open ? pulse : 0}
    />
  );

  return (
    <div
      ref={rootRef}
      className={
        visible ? "radial-activity radial-activity--open" : "radial-activity"
      }
      role="group"
      aria-label="Choose an activity"
      aria-hidden={!open}
      onPointerDown={stopPointer}
    >
      {gradientHost ? createPortal(gradient, gradientHost) : null}
      <div
        className="radial-activity__catch"
        style={{
          left: center.x,
          top: center.y,
          width: ACTIVITY_LAYOUT.gradient,
          height: ACTIVITY_LAYOUT.gradient,
        }}
      />
      {placements.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="radial-activity__token"
          style={{
            left: entry.left,
            top: entry.top,
            width: entry.width,
            opacity: entry.opacity,
            zIndex: Math.round(entry.opacity * 10),
            pointerEvents: entry.interactive && open ? "auto" : "none",
          }}
          aria-label={entry.label}
          aria-describedby={
            info?.id === entry.id ? `activity-info-${entry.id}` : undefined
          }
          data-activity={entry.id}
          data-layer={entry.layer}
          tabIndex={entry.interactive && open ? 0 : -1}
          disabled={!open || !entry.interactive}
          onPointerEnter={(event) => showInfo(event.currentTarget, entry)}
          onPointerLeave={() => hideInfo(entry.id)}
          onFocus={(event) => showInfo(event.currentTarget, entry)}
          onBlur={() => hideInfo(entry.id)}
          onClick={() => {
            const activity = ACTIVITY_BY_ID.get(entry.id);
            if (activity) onPick(activity);
          }}
        >
          <img src={`/tokens/${entry.asset}`} alt="" draggable={false} />
        </button>
      ))}
      {departing.map((entry) => (
        <button
          key={`leaving-${entry.id}`}
          type="button"
          className="radial-activity__token radial-activity__token--leaving"
          style={{
            left: entry.left,
            top: entry.top,
            width: entry.width,
            opacity: entry.opacity,
            pointerEvents: "none",
          }}
          tabIndex={-1}
          disabled
          aria-hidden
          data-activity={entry.id}
        >
          <img src={`/tokens/${entry.asset}`} alt="" draggable={false} />
        </button>
      ))}
      {info && viewportRef.current ? (
        <TokenInfoCard anchor={info} viewport={viewportRef.current} />
      ) : null}
      <ActivityFilterPanel
        open={open}
        viewport={viewportRef.current}
        query={searchQuery}
        phases={selectedManualPhases}
        empty={open && visibleActivities.length === 0}
        onQuery={setSearchQuery}
        onTogglePhase={togglePhase}
        onClear={clearFilters}
      />
    </div>
  );
}

const INFO_GAP = 10;
const INFO_MARGIN = 8;

function infoSide(
  prefer: "left" | "right",
  leftFits: boolean,
  rightFits: boolean,
  roomLeft: number,
  roomRight: number,
): "left" | "right" {
  if (prefer === "left" && leftFits) return "left";
  if (prefer === "right" && rightFits) return "right";
  if (leftFits !== rightFits) return leftFits ? "left" : "right";
  return roomRight >= roomLeft ? "right" : "left";
}

function TokenInfoCard({
  anchor,
  viewport,
}: {
  anchor: InfoAnchor;
  viewport: HTMLElement;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let frame = 0;

    function place() {
      const node = cardRef.current;
      if (!node) return;
      const token = anchor.element.getBoundingClientRect();
      const bounds = viewport.getBoundingClientRect();
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      const toolbar = document.querySelector(".toolbar")?.getBoundingClientRect();
      const minLeft = toolbar
        ? Math.max(INFO_MARGIN, toolbar.right - bounds.left + 8)
        : INFO_MARGIN;
      const maxLeft = bounds.width - width - INFO_MARGIN;
      const roomRight = bounds.right - token.right;
      const roomLeft = token.left - bounds.left - minLeft;
      const leftEdge = token.left - bounds.left - INFO_GAP - width;
      const rightEdge = token.right - bounds.left + INFO_GAP;
      const side = infoSide(
        anchor.prefer,
        leftEdge >= minLeft,
        rightEdge <= maxLeft,
        roomLeft,
        roomRight,
      );
      const rawTop = token.top - bounds.top + (token.height - height) / 2;
      const top = Math.max(
        INFO_MARGIN,
        Math.min(rawTop, bounds.height - height - INFO_MARGIN),
      );
      const rawLeft = side === "right" ? rightEdge : leftEdge;
      const left = Math.max(minLeft, Math.min(rawLeft, Math.max(minLeft, maxLeft)));
      node.style.top = `${top}px`;
      node.style.left = `${left}px`;
      node.dataset.placed = "true";
    }

    place();
    frame = requestAnimationFrame(function follow() {
      place();
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor, viewport]);

  return createPortal(
    <div
      ref={cardRef}
      className="radial-activity__info"
      role="tooltip"
      id={`activity-info-${anchor.id}`}
    >
      <ActivityInfoCopy id={anchor.id} fallback={anchor.label} />
    </div>,
    viewport,
  );
}

function ActivityInfoCopy({ id, fallback }: { id: string; fallback: string }) {
  const copy = activityInfoFor(id);
  if (!copy) {
    return <p className="radial-activity__info-label">{fallback}</p>;
  }
  return (
    <>
      <ul className="radial-activity__info-list">
        <li>
          <strong>Best for:</strong> {bestForLabel(copy.bestFor)}
        </li>
        <li>
          <strong>When to use?</strong> {copy.whenToUse}
        </li>
      </ul>
      <p className="radial-activity__info-more">
        <ChevronUp size={18} strokeWidth={2.25} aria-hidden />
        Read More
      </p>
    </>
  );
}
