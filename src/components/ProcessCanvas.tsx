import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { CanvasView } from "../canvas/view";
import { DRAG } from "../process/dragConfig";
import type { DragPose } from "../process/dragPose";
import { slotPolygon } from "../process/dragTargets";
import { nextAddSeam } from "../process/editToken";
import { layoutProcess, tokenWorldOutline } from "../process/processLayout";
import { geometryFor, polygonPoints } from "../process/tokenGeometry";
import type { CatalogEntry, MenuCategory } from "../process/tokenCatalog";
import type { PlacedToken, Point, ProcessToken } from "../process/processTypes";
import { useProcessDrag } from "./useProcessDrag";
import { InsertionMenu } from "./InsertionMenu";
import { ProcessTokenView } from "./ProcessToken";
import { TokenChrome } from "./TokenChrome";
import "./ProcessCanvas.css";

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
  selectedId: string | null;
  replaceId: string | null;
  onSelect: (id: string) => void;
  gapOpen: boolean;
  onRemove: () => void;
  onSwitch: () => void;
  onReorder: (tokens: ProcessToken[]) => void;
  onPanBy: (dx: number, dy: number) => void;
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
  selectedId,
  replaceId,
  onSelect,
  gapOpen,
  onRemove,
  onSwitch,
  onReorder,
  onPanBy,
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
  const selectedOutline =
    dragging ? null : selectionOutline(placed, displayTokens, selectedId);
  const switchOrigin =
    replaceId && selectedOutline ? centroidOf(selectedOutline) : null;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimer = useRef(0);
  const homeTarget = dragging && activeIndex === sourceIndex;
  const tokenById = useMemo(
    () => new Map(displayTokens.map((token) => [token.id, token])),
    [displayTokens],
  );

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
      className={dragging ? "process-layer process-layer--dragging" : "process-layer"}
      style={{ ["--reflow-ms" as string]: `${DRAG.reflowMs}ms` }}
    >
      {placed.map((item) => {
        if (hidden.has(item.token.id)) return null;
        const dragId = dragTargetId(item, seated);
        return (
          <ProcessTokenView
            key={item.token.id}
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
              item.token.id === selectedId ||
              (item.token.type === "start" && seated?.id === selectedId)
            }
            selectLabel={
              item.token.type === "start" ? seated?.label : undefined
            }
            onSelect={dragId ? () => onSelect(dragId) : undefined}
            onPress={dragId ? (event) => beginGesture(dragId, event) : undefined}
            onHover={dragId ? () => showHover(dragId) : undefined}
            onHoverEnd={dragId ? () => hideHover(dragId) : undefined}
          />
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
              </div>
            );
          })
        : null}
      {!dragging && hoveredId ? (
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
      {selectedOutline ? (
        <TokenChrome
          points={selectedOutline}
          viewScale={view.scale}
          onRemove={onRemove}
          onSwitch={
            tokens.find((token) => token.id === selectedId)?.type === "checkpoint"
              ? undefined
              : onSwitch
          }
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

function selectionOutline(
  placed: PlacedToken[],
  tokens: ProcessToken[],
  selectedId: string | null,
): Point[] | null {
  if (!selectedId) return null;
  const selected = tokens.find((token) => token.id === selectedId);
  if (
    !selected ||
    (selected.type !== "phase" &&
      selected.type !== "activity" &&
      selected.type !== "checkpoint")
  ) {
    return null;
  }
  const own = placed.find((item) => item.token.id === selectedId);
  if (own) return tokenWorldOutline(own);
  const start = placed.find((item) => item.token.type === "start");
  return start ? tokenWorldOutline(start) : null;
}

function centroidOf(points: readonly Point[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
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
