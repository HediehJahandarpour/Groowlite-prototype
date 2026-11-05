import {
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import type { CatalogEntry } from "../../process/tokenCatalog";
import {
  PHASE_ARC,
  blendPhaseSeats,
  phaseCircleBlend,
  placePhaseArc,
  placePhaseCircle,
} from "../../exploration/phaseArcLayout";
import { createIdleFloat } from "../../exploration/idleFloat";
import {
  EXPLORER_MOTION,
  prefersReducedMotion,
} from "../../exploration/explorerMotion";

type PersistentPhaseArcProps = {
  active: boolean;
  anchorX: number;
  anchorY: number;
  /** Outer gradient radius — open half-arc seats. */
  radius: number;
  /** Inner stroke radius — closed circle like the phase selector. */
  circleRadius: number;
  tokenSize: number;
  width: number;
  height: number;
  scrollSpan: number;
  subscribe: (listener: (progress: number) => void) => () => void;
  onPick: (entry: CatalogEntry) => void;
};

/**
 * Phase tokens on the outer right gradient ring.
 * They stay out of activity depth promotion, but morph with scroll:
 * open half-arc at the start → full circle at the end of activity scroll.
 */
export function PersistentPhaseArc({
  active,
  anchorX,
  anchorY,
  radius,
  circleRadius,
  tokenSize,
  width,
  height,
  scrollSpan,
  subscribe,
  onPick,
}: PersistentPhaseArcProps) {
  const openSeats = useMemo(
    () => placePhaseArc(radius, width, height, tokenSize),
    [radius, width, height, tokenSize],
  );
  const circleSeats = useMemo(
    () => placePhaseCircle(circleRadius, width, height, tokenSize),
    [circleRadius, width, height, tokenSize],
  );
  const size = tokenSize * PHASE_ARC.sizeFactor;
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const pickLock = useRef(false);
  const scrollSpanRef = useRef(scrollSpan);
  scrollSpanRef.current = scrollSpan;

  useLayoutEffect(() => {
    if (!active || openSeats.length === 0) return;

    const paint = (progress: number) => {
      const blend = phaseCircleBlend(progress, scrollSpanRef.current);
      const seats = blendPhaseSeats(openSeats, circleSeats, blend);
      const scale =
        1 + (PHASE_ARC.circleSizeFactor - 1) * blend;
      for (const seat of seats) {
        const node = nodes.current.get(seat.entry.id);
        if (!node) continue;
        node.style.transform = `translate3d(calc(-50% + ${seat.x.toFixed(2)}px), calc(-50% + ${seat.y.toFixed(2)}px), 0) scale(${scale.toFixed(3)})`;
      }
    };

    paint(0);
    return subscribe(paint);
  }, [active, openSeats, circleSeats, subscribe]);

  useLayoutEffect(() => {
    if (!active || openSeats.length === 0) return;
    const reduced = prefersReducedMotion();
    if (!EXPLORER_MOTION.idle.enabled || reduced) return;

    const floaters = openSeats.flatMap((seat, index) => {
      const element = nodes.current
        .get(seat.entry.id)
        ?.querySelector(".float-token__float");
      if (!(element instanceof HTMLElement)) return [];
      return [
        {
          id: seat.entry.id,
          rank: index,
          group: 0,
          element,
        },
      ];
    });
    if (floaters.length === 0) return;

    const idle = createIdleFloat(floaters, reduced);
    for (const floater of floaters) idle.setVisible(floater.id, true);
    return () => idle.destroy();
  }, [active, openSeats, size]);

  if (!active) return null;

  return (
    <div
      className="explorer-phase-arc"
      style={{
        ["--anchor-x" as string]: `${anchorX}px`,
        ["--anchor-y" as string]: `${anchorY}px`,
      }}
      aria-label="Phase tokens"
    >
      {openSeats.map((seat) => (
        <PhaseArcToken
          key={seat.entry.id}
          id={seat.entry.id}
          label={seat.entry.label}
          asset={seat.entry.asset}
          entry={seat.entry}
          x={seat.x}
          y={seat.y}
          size={size}
          pickLock={pickLock}
          nodes={nodes}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function PhaseArcToken({
  id,
  label,
  asset,
  entry,
  x,
  y,
  size,
  pickLock,
  nodes,
  onPick,
}: {
  id: string;
  label: string;
  asset: string;
  entry: CatalogEntry;
  x: number;
  y: number;
  size: number;
  pickLock: MutableRefObject<boolean>;
  nodes: MutableRefObject<Map<string, HTMLButtonElement>>;
  onPick: (entry: CatalogEntry) => void;
}) {
  return (
    <button
      type="button"
      className="float-token float-token--phase-arc is-near"
      data-ready="true"
      tabIndex={0}
      aria-label={label}
      ref={(node) => {
        if (node) nodes.current.set(id, node);
        else nodes.current.delete(id);
      }}
      style={{
        width: size,
        opacity: 1,
        ["--fade" as string]: "1",
        transform: `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0)`,
      }}
      onClick={(event) => {
        if (pickLock.current) return;
        pickLock.current = true;
        const node = event.currentTarget;
        node.classList.add("is-confirmed");
        onPick(entry);
        window.setTimeout(() => {
          node.classList.remove("is-confirmed");
          pickLock.current = false;
        }, 160);
      }}
    >
      <svg
        className="float-token__stroke"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <polygon points="50,1 98,35 80,93 20,93 2,35" fill="none" />
      </svg>
      <span className="float-token__check" aria-hidden="true">
        ✓
      </span>
      <span className="float-token__art">
        <span className="float-token__tilt">
          <span className="float-token__float">
            <img src={`/tokens/${asset}`} alt="" draggable={false} />
          </span>
        </span>
      </span>
    </button>
  );
}
