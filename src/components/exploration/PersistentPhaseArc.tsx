import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { flushSync } from "react-dom";
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
import {
  flyTokenToProcess,
  hideDepartingToken,
  tokenFlightRect,
} from "../../exploration/flyTokenToProcess";
import { ExplorerTokenCard } from "./ExplorerTokenCard";

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
  viewport: HTMLElement | null;
};

type HoveredPhase = {
  id: string;
  anchor: HTMLButtonElement;
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
  viewport,
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
  const [hover, setHover] = useState<HoveredPhase | null>(null);
  const [departedIds, setDepartedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const scrollSpanRef = useRef(scrollSpan);
  scrollSpanRef.current = scrollSpan;

  useLayoutEffect(() => {
    if (!active) {
      setHover(null);
      return;
    }
    // Fresh open restores any phases picked in the previous visit.
    setDepartedIds(new Set());
  }, [active]);

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
      {openSeats.map((seat) => {
        const departed = departedIds.has(seat.entry.id);
        return (
          <PhaseArcToken
            key={seat.entry.id}
            id={seat.entry.id}
            label={seat.entry.label}
            asset={seat.entry.asset}
            entry={seat.entry}
            x={seat.x}
            y={seat.y}
            size={size}
            departed={departed}
            pickLock={pickLock}
            nodes={nodes}
            onPick={onPick}
            onDepart={() =>
              setDepartedIds((current) => {
                const next = new Set(current);
                next.add(seat.entry.id);
                return next;
              })
            }
            onShowInfo={(node) =>
              setHover({ id: seat.entry.id, anchor: node })
            }
            onHideInfo={() =>
              setHover((current) =>
                current?.id === seat.entry.id ? null : current,
              )
            }
          />
        );
      })}
      {hover && viewport && !departedIds.has(hover.id) ? (
        <ExplorerTokenCard
          id={hover.id}
          anchor={hover.anchor}
          viewport={viewport}
        />
      ) : null}
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
  departed,
  pickLock,
  nodes,
  onPick,
  onDepart,
  onShowInfo,
  onHideInfo,
}: {
  id: string;
  label: string;
  asset: string;
  entry: CatalogEntry;
  x: number;
  y: number;
  size: number;
  departed: boolean;
  pickLock: MutableRefObject<boolean>;
  nodes: MutableRefObject<Map<string, HTMLButtonElement>>;
  onPick: (entry: CatalogEntry) => void;
  onDepart: () => void;
  onShowInfo: (node: HTMLButtonElement) => void;
  onHideInfo: () => void;
}) {
  return (
    <button
      type="button"
      className={
        departed
          ? "float-token float-token--phase-arc is-near is-departing"
          : "float-token float-token--phase-arc is-near"
      }
      data-ready={departed ? "false" : "true"}
      data-departed={departed ? "true" : "false"}
      tabIndex={departed ? -1 : 0}
      aria-label={label}
      aria-hidden={departed || undefined}
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
      onMouseEnter={(event) => {
        if (departed) return;
        onShowInfo(event.currentTarget);
      }}
      onMouseLeave={onHideInfo}
      onFocus={(event) => {
        if (departed) return;
        onShowInfo(event.currentTarget);
      }}
      onBlur={onHideInfo}
      onClick={(event) => {
        if (pickLock.current || departed) return;
        pickLock.current = true;
        const node = event.currentTarget;
        onHideInfo();
        const from = tokenFlightRect(node);
        hideDepartingToken(node);
        onDepart();
        flyTokenToProcess({
          asset,
          from,
          onCommit: () => {
            flushSync(() => {
              onPick(entry);
            });
          },
          onDone: () => {
            pickLock.current = false;
          },
        });
      }}
    >
      <svg
        className="float-token__stroke"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <polygon points="50,1 98,35 80,93 20,93 2,35" fill="none" />
      </svg>
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
