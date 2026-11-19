import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import gsap from "gsap";
import { screenToWorld, type CanvasView } from "../canvas/view";
import { EXPLORATION } from "../exploration/explorationConfig";
import type { ScreenRect as ZoneRect } from "../exploration/cameraFocus";
import type { ProcessSplit, SplitPose } from "../exploration/processSplit";
import { DRAG } from "../process/dragConfig";
import type { DragPose } from "../process/dragPose";
import { slotPolygon } from "../process/dragTargets";
import { nextAddSeam } from "../process/editToken";
import {
  collectiveSelectionBounds,
  selectableOutline,
  selectedInProcessOrder,
  tokensIntersectingRect,
  type ScreenRect,
} from "../process/multiSelect";
import { stampById } from "../process/overviewStamps";
import { upperEdgeSeat } from "../process/stampSeat";
import { layoutProcess, tokenWorldOutline } from "../process/processLayout";
import { geometryFor, polygonPoints } from "../process/tokenGeometry";
import type { CatalogEntry, MenuCategory } from "../process/tokenCatalog";
import type { PlacedToken, Point, ProcessToken, SlotStamps } from "../process/processTypes";
import { useProcessDrag, type SelectOptions } from "./useProcessDrag";
import { InsertionMenu } from "./InsertionMenu";
import { MultiTokenChrome } from "./MultiTokenChrome";
import { ProcessTokenView } from "./ProcessToken";
import { SelectedTokenOutline, TokenChrome } from "./TokenChrome";
import "./ProcessCanvas.css";

const EMPTY_ZONES: ZoneRect[] = [];
/** Stamp width relative to the token slot, matching the pieces in Figma 6126:208342. */
const STAMP_SCALE = 0.62;
const IDENTITY_SHIFT: SplitPose = { x: 0, y: 0, scale: 1, opacity: 1 };
/** World padding around the collective multi-selection boundary. */
const MULTI_BOUNDS_PAD = 14;

type ProcessCanvasProps = {
  tokens: ProcessToken[];
  activeInsertion: number;
  menuOpen: boolean;
  category: MenuCategory | null;
  onActivate: (index: number) => void;
  onCategory: (category: MenuCategory) => void;
  onPick: (entry: CatalogEntry, keepOpen?: boolean) => void;
  onExploreMode: (category: MenuCategory) => void;
  addedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCloseMenu: () => void;
  viewportRef: RefObject<HTMLDivElement | null>;
  view: CanvasView;
  selectedIds: readonly string[];
  /** Live marquee highlight while dragging a selection rectangle. */
  marqueeRect: ScreenRect | null;
  /** Shift-marquee keeps the existing selection highlighted. */
  marqueeAdditive: boolean;
  /** Lets the parent resolve box-select hits against current layout. */
  hitTestRef: RefObject<(rect: ScreenRect) => string[]>;
  /** Slot under a screen point, for drops from the overview toolbar. */
  tokenAtRef: RefObject<(clientX: number, clientY: number) => string | null>;
  /** Pieces sitting on slots, keyed by seam index. */
  slotStamps: SlotStamps;
  /** Toolbar piece currently hovering a slot. */
  stampTargetId?: string | null;
  /** A toolbar piece is selected and the next slot click places it. */
  stamping?: boolean;
  onStamp: (slotIndex: string) => void;
  replaceId: string | null;
  /** When false, exploration owns the canvas. */
  selectionEnabled?: boolean;
  onSelect: (id: string, options?: SelectOptions) => void;
  gapOpen: boolean;
  onRemove: () => void;
  onExport: () => void;
  onSwitch: () => void;
  onReorder: (tokens: ProcessToken[]) => void;
  onPanBy: (dx: number, dy: number) => void;
  explorationActive?: boolean;
  explorationAtmosphere?: number;
  explorationSplit?: ProcessSplit | null;
  /** Drives the open and close of the visual split. Stays false while the camera returns. */
  splitOpen?: boolean;
  atmosphereHost?: HTMLElement | null;
};

export function ProcessCanvas({
  tokens,
  activeInsertion,
  menuOpen,
  category,
  onActivate,
  onCategory,
  onPick,
  onExploreMode,
  addedCount,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCloseMenu,
  viewportRef,
  view,
  selectedIds,
  marqueeRect,
  marqueeAdditive,
  hitTestRef,
  tokenAtRef,
  slotStamps,
  stampTargetId = null,
  stamping = false,
  onStamp,
  replaceId,
  selectionEnabled = true,
  onSelect,
  gapOpen,
  onRemove,
  onExport,
  onSwitch,
  onReorder,
  onPanBy,
  explorationActive = false,
  explorationAtmosphere = 0,
  explorationSplit = null,
  splitOpen = false,
  atmosphereHost = null,
}: ProcessCanvasProps) {
  const {
    dragging,
    blockIds,
    sourceIndex,
    activeIndex,
    primaryId,
    displayTokens,
    floatPoses,
    beginGesture,
  } = useProcessDrag({
    tokens,
    view,
    viewportRef,
    selectedIds,
    onReorder,
    onSelect,
    onPanBy,
    onCloseMenu,
  });
  const hidden = useMemo(() => new Set(blockIds), [blockIds]);
  const layout = useMemo(() => layoutProcess(displayTokens), [displayTokens]);
  const { placed, slots, occupied, seatedInStart } = layout;
  const seamCount = occupied + (seatedInStart ? 1 : 0);
  const insertionIndex = Math.max(0, Math.min(activeInsertion, seamCount));
  const seated = seatedToken(displayTokens);
  const pentagonImage = seated ? `/tokens/${seated.asset}` : undefined;
  const pentagonArt = seated ? phaseArt(seated) : undefined;
  const seatedDragged = Boolean(seated && hidden.has(seated.id));
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const marqueeIds = useMemo(() => {
    if (!marqueeRect || dragging) return [] as string[];
    return tokensIntersectingRect(placed, displayTokens, view, marqueeRect);
  }, [marqueeRect, dragging, placed, displayTokens, view]);
  const highlightIds = useMemo(() => {
    if (!marqueeRect) return selectedSet;
    if (marqueeAdditive) {
      const next = new Set(selectedSet);
      for (const id of marqueeIds) next.add(id);
      return next;
    }
    return new Set(marqueeIds);
  }, [marqueeRect, marqueeAdditive, marqueeIds, selectedSet]);
  const multiSelected =
    !dragging && !marqueeRect && selectedIds.length >= 2;
  const singleOutline =
    dragging || marqueeRect || selectedIds.length !== 1
      ? null
      : selectableOutline(placed, displayTokens, selectedIds[0]);
  const multiBounds = multiSelected
    ? collectiveSelectionBounds(
        placed,
        displayTokens,
        selectedIds,
        MULTI_BOUNDS_PAD / Math.max(view.scale, 0.001),
      )
    : null;
  const switchOrigin =
    replaceId && singleOutline ? centroidOf(singleOutline) : null;

  hitTestRef.current = (rect) =>
    tokensIntersectingRect(placed, displayTokens, view, rect);
  tokenAtRef.current = (clientX, clientY) => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const bounds = viewport.getBoundingClientRect();
    const world = screenToWorld(view, clientX - bounds.left, clientY - bounds.top);
    for (let index = placed.length - 1; index >= 0; index -= 1) {
      const item = placed[index];
      if (hidden.has(item.token.id)) continue;
      const outline = tokenWorldOutline(item);
      if (outline.length < 3 || !pointInPolygon(world, outline)) continue;
      if (item.token.type === "start" && seated) return seated.id;
      return item.token.id;
    }
    return null;
  };
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimer = useRef(0);
  const homeTarget = dragging && activeIndex === sourceIndex;
  const tokenById = useMemo(
    () => new Map(displayTokens.map((token) => [token.id, token])),
    [displayTokens],
  );
  const layerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = layerRef.current;
    if (!node) return;
    node.classList.add("process-layer--splitting");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const proxy = {
      value: Number.parseFloat(node.style.getPropertyValue("--split")) || 0,
    };
    const tween = gsap.to(proxy, {
      value: splitOpen ? 1 : 0,
      duration: reduced ? 0 : EXPLORATION.transitionDuration,
      ease: "power2.inOut",
      overwrite: true,
      onUpdate: () => node.style.setProperty("--split", proxy.value.toFixed(4)),
      onComplete: () => {
        node.style.setProperty("--split", splitOpen ? "1" : "0");
        if (splitOpen) node.classList.remove("process-layer--splitting");
      },
    });
    return () => {
      tween.kill();
    };
  }, [splitOpen]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const poses = explorationSplit?.poses ?? {};
    // Apply split poses immediately so each pick pushes the process clear of
    // the selector before the handoff flight measures the seat.
    layer.querySelectorAll<HTMLElement>(".process-token-shift").forEach((node) => {
      const id = node.querySelector(".process-token")?.getAttribute("data-token-id");
      if (!id) return;
      const pose = poses[id] ?? IDENTITY_SHIFT;
      gsap.killTweensOf(node);
      writeShift(node, pose);
    });
  }, [explorationSplit, splitOpen]);

  function showHover(id: string) {
    window.clearTimeout(hoverTimer.current);
    setHoveredId(id);
  }

  function hideHover(id: string) {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setHoveredId((current) => (current === id ? null : current));
    }, 280);
  }

  const floaterIds = primaryId
    ? [...blockIds.filter((id) => id !== primaryId), primaryId]
    : blockIds;

  return (
    <div
      ref={layerRef}
      className={[
        "process-layer",
        dragging ? "process-layer--dragging" : "",
        splitOpen ? "process-layer--split-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ["--reflow-ms" as string]: `${DRAG.reflowMs}ms` }}
    >
      {placed.map((item) => {
        if (hidden.has(item.token.id)) return null;
        if (explorationActive && item.token.type === "end") return null;
        const dragId = dragTargetId(item, seated);
        return (
          <div key={item.token.id} className="process-token-shift">
            <ProcessTokenView
              placed={item}
              hidePentagon={item.token.type === "start"}
              pentagonImage={
                item.token.type === "start" && !seatedDragged ? pentagonImage : undefined
              }
              pentagonArt={
                item.token.type === "start" && !seatedDragged ? pentagonArt : undefined
              }
              seatedTurn={item.token.type === "start" ? (seated?.turn ?? 0) : 0}
              selected={
                (dragId != null && highlightIds.has(dragId)) ||
                (item.token.type === "start" &&
                  seated != null &&
                  highlightIds.has(seated.id))
              }
              selectLabel={
                item.token.type === "start" ? seated?.label : undefined
              }
              onSelect={
                stamping && (dragId || item.token.type === "start")
                  ? () => onStamp(dragId ?? item.token.id)
                  : selectionEnabled && dragId
                    ? () => onSelect(dragId)
                    : undefined
              }
              onPress={
                stamping
                  ? undefined
                  : selectionEnabled && dragId
                    ? (event) => beginGesture(dragId, event)
                    : undefined
              }
              onHover={
                selectionEnabled && dragId
                  ? () => showHover(dragId)
                  : undefined
              }
              onHoverEnd={
                selectionEnabled && dragId
                  ? () => hideHover(dragId)
                  : undefined
              }
            />
            <SlotStamp
              ownerId={dragId ?? item.token.id}
              outline={tokenWorldOutline(item)}
              slotStamps={slotStamps}
              hot={stampTargetId === (dragId ?? (item.token.type === "start" ? item.token.id : null))}
            />
          </div>
        );
      })}
      {dragging
        ? blockIds.map((id) => {
            const polygon = slotPolygon(layout, displayTokens, id);
            if (polygon.length < 3) return null;
            return (
              <svg
                key={id}
                className={homeTarget ? "drag-slot drag-slot--home" : "drag-slot"}
                viewBox="0 0 4000 4000"
                aria-hidden="true"
              >
                <polygon
                  points={polygonPoints(polygon)}
                  strokeWidth={2.5 / view.scale}
                />
              </svg>
            );
          })
        : null}
      {floatPoses
        ? floaterIds.map((id) => {
            const token = tokenById.get(id);
            const pose = floatPoses[id];
            if (!token || !pose) return null;
            return (
              <div key={id} className="drag-floater">
                <ProcessTokenView placed={placedFromPose(token, pose)} floating />
                <SlotStamp
                  ownerId={id}
                  outline={tokenWorldOutline(placedFromPose(token, pose))}
                  slotStamps={slotStamps}
                  hot={false}
                />
              </div>
            );
          })
        : null}
      {!dragging && selectionEnabled && hoveredId ? (
        <TokenGrip
          id={hoveredId}
          label={tokenById.get(hoveredId)?.label ?? "token"}
          points={gripOutline(placed, tokens, hoveredId)}
          viewScale={view.scale}
          onPress={(event) => beginGesture(hoveredId, event)}
          onHover={() => showHover(hoveredId)}
          onHoverEnd={() => hideHover(hoveredId)}
        />
      ) : null}
      {!dragging && selectionEnabled && (multiSelected || marqueeRect)
        ? [...highlightIds].map((id) => {
            const outline = selectableOutline(placed, displayTokens, id);
            if (!outline) return null;
            return (
              <SelectedTokenOutline
                key={`sel-${id}`}
                points={outline}
                viewScale={view.scale}
              />
            );
          })
        : null}
      {singleOutline ? (
        <TokenChrome
          points={singleOutline}
          viewScale={view.scale}
          onRemove={onRemove}
          onExport={onExport}
          onSwitch={
            tokens.find((token) => token.id === selectedId)?.type === "checkpoint"
              ? undefined
              : onSwitch
          }
        />
      ) : null}
      {multiBounds ? (
        <MultiTokenChrome
          bounds={multiBounds}
          viewScale={view.scale}
          onRemove={onRemove}
          onExport={onExport}
          onPress={(event) => {
            const primary = selectedInProcessOrder(tokens, selectedIds)[0]?.id;
            if (primary) beginGesture(primary, event);
          }}
        />
      ) : null}
      <InsertionMenu
        placed={placed}
        slots={slots}
        occupied={seamCount}
        phaseInStart={seatedInStart}
        activeIndex={insertionIndex}
        open={menuOpen}
        category={category}
        onActivate={onActivate}
        onCategory={onCategory}
        onPick={onPick}
        onExploreMode={onExploreMode}
        addedCount={addedCount}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onClose={onCloseMenu}
        processTokens={tokens}
        replaceId={replaceId}
        viewportRef={viewportRef}
        view={view}
        markedIndex={nextAddSeam(tokens, selectedId)}
        placeholderOpen={gapOpen && !dragging}
        switchOrigin={switchOrigin}
        suspended={dragging}
        explorationActive={explorationActive}
        explorationAtmosphere={explorationAtmosphere}
        explorationZones={explorationSplit?.zones ?? EMPTY_ZONES}
        atmosphereHost={atmosphereHost}
      />
    </div>
  );
}

function TokenGrip({
  id,
  label,
  points,
  viewScale,
  onPress,
  onHover,
  onHoverEnd,
}: {
  id: string;
  label: string;
  points: Point[] | null;
  viewScale: number;
  onPress: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onHover: () => void;
  onHoverEnd: () => void;
}) {
  if (!points || points.length < 3 || viewScale <= 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return (
    <button
      type="button"
      className="token-grip"
      data-token-id={id}
      aria-label={`Reorder ${label}`}
      tabIndex={-1}
      style={{
        left: (minX + maxX) / 2,
        top: maxY + 12 / viewScale,
        transform: `translate(-50%, 0) scale(${1 / viewScale})`,
      }}
      onPointerDown={onPress}
      onPointerEnter={onHover}
      onPointerLeave={onHoverEnd}
    >
      <span />
      <span />
    </button>
  );
}

function placedFromPose(token: ProcessToken, pose: DragPose): PlacedToken {
  return {
    token,
    x: pose.x,
    y: pose.y,
    heading: pose.heading,
    scale: pose.scale,
    outputX: null,
    outputY: null,
  };
}

function gripOutline(placed: PlacedToken[], tokens: ProcessToken[], id: string): Point[] | null {
  const own = placed.find((item) => item.token.id === id);
  if (own) return tokenWorldOutline(own);
  const seated = seatedToken(tokens);
  if (seated?.id !== id) return null;
  const start = placed.find((item) => item.token.type === "start");
  return start ? tokenWorldOutline(start) : null;
}

function dragTargetId(item: PlacedToken, seated: ProcessToken | null): string | null {
  if (
    item.token.type === "phase" ||
    item.token.type === "activity" ||
    item.token.type === "checkpoint"
  ) {
    return item.token.id;
  }
  if (item.token.type === "start" && seated) return seated.id;
  return null;
}

/** The first chain token, drawn into the starting-point pentagon in place of the blue fill. */
function seatedToken(tokens: ProcessToken[]): ProcessToken | null {
  const first = tokens
    .filter((token) => token.type === "phase" || token.type === "activity")
    .sort((a, b) => a.order - b.order)[0];
  if (!first || !geometryFor(first).outline) return null;
  return first;
}

function SlotStamp({
  ownerId,
  outline,
  slotStamps,
  hot,
}: {
  ownerId: string;
  outline: Point[];
  slotStamps: SlotStamps;
  hot: boolean;
}) {
  const pieceId = slotStamps[ownerId];
  if ((!pieceId && !hot) || outline.length < 3) return null;
  const seat = upperEdgeSeat(outline);
  const piece = pieceId ? stampById(pieceId) : null;
  const span = slotSpan(outline);
  const width = piece ? span * STAMP_SCALE : 0;
  const height = piece ? width * (piece.height / piece.width) : 0;
  const seatStyle = {
    left: seat.x,
    top: seat.y,
    ["--stamp-tilt" as string]: `${seat.tilt}deg`,
    ["--stamp-foot" as string]: `${piece?.foot ?? 100}%`,
  };
  return (
    <>
      {hot ? (
        <div
          className="slot-stamp-hit slot-stamp-hit--hot"
          style={{ ...seatStyle, width: span * STAMP_SCALE, height: span * STAMP_SCALE }}
        />
      ) : null}
      {piece ? (
        <img
          className="slot-stamp"
          src={`/tokens/${piece.asset}`}
          alt=""
          width={Math.round(width)}
          height={Math.round(height)}
          draggable={false}
          style={{ ...seatStyle, width, height }}
        />
      ) : null}
    </>
  );
}

function slotSpan(points: readonly Point[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
  }
  return Math.max(36, maxX - minX);
}

function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    const crosses =
      current.y > point.y !== prior.y > point.y &&
      point.x <
        ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function centroidOf(points: readonly Point[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function writeShift(node: HTMLElement, pose: SplitPose) {
  node.style.setProperty("--shift-x", String(pose.x));
  node.style.setProperty("--shift-y", String(pose.y));
  node.style.setProperty("--shift-scale", String(pose.scale));
  node.style.setProperty("--shift-opacity", String(pose.opacity));
}

function phaseArt(token: ProcessToken) {
  const geometry = geometryFor(token);
  return {
    width: geometry.width,
    height: geometry.height,
    body: geometry.outline ?? [],
    cover: 1.06,
  };
}
