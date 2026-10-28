import { useEffect, useState, type RefObject } from "react";
import type { CanvasView } from "../canvas/view";
import { ACTIVITY_LAYOUT } from "../process/activityMotion";
import { nextAddSeam } from "../process/editToken";
import { layoutProcess, tokenWorldOutline } from "../process/processLayout";
import { RADIAL, type WorldBounds } from "../process/radialLayout";
import { geometryFor } from "../process/tokenGeometry";
import type { CatalogEntry, MenuCategory } from "../process/tokenCatalog";
import type { PlacedToken, Point, ProcessToken } from "../process/processTypes";
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
  onPick: (entry: CatalogEntry) => void;
  onCloseMenu: () => void;
  onFitRadial: (bounds: WorldBounds) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
  view: CanvasView;
  selectedId: string | null;
  replaceId: string | null;
  onSelect: (id: string) => void;
  gapOpen: boolean;
  onRemove: () => void;
  onSwitch: () => void;
};

export function ProcessCanvas({
  tokens,
  activeInsertion,
  menuOpen,
  category,
  onActivate,
  onCategory,
  onPick,
  onCloseMenu,
  onFitRadial,
  viewportRef,
  view,
  selectedId,
  replaceId,
  onSelect,
  gapOpen,
  onRemove,
  onSwitch,
}: ProcessCanvasProps) {
  const { placed, slots, occupied, seatedInStart } = layoutProcess(tokens);
  const seamCount = occupied + (seatedInStart ? 1 : 0);
  const insertionIndex = Math.max(0, Math.min(activeInsertion, seamCount));
  const phaseLibrary = menuOpen && category === "phase";
  const activityLibrary = menuOpen && category === "activity";
  const radarOpen = phaseLibrary || activityLibrary;
  const radarFront = useRadarHold(radarOpen);
  const [gradientHost, setGradientHost] = useState<HTMLDivElement | null>(null);
  const seated = seatedToken(tokens);
  const pentagonImage = seated ? `/tokens/${seated.asset}` : undefined;
  const pentagonArt = seated ? phaseArt(seated) : undefined;
  const selectedOutline = selectionOutline(placed, tokens, selectedId);
  const switchOrigin =
    replaceId && selectedOutline ? centroidOf(selectedOutline) : null;

  return (
    <>
      <div
        ref={setGradientHost}
        className={
          radarFront
            ? "phase-gradient-host phase-gradient-host--front"
            : "phase-gradient-host"
        }
      />
      {placed.map((item) => {
        const parked =
          !replaceId &&
          (phaseLibrary || activityLibrary) &&
          item.token.type === "end"
            ? {
                ...item,
                x:
                  item.x +
                  (activityLibrary
                    ? ACTIVITY_LAYOUT.endpointClearance
                    : RADIAL.endpointClearance),
              }
            : item;
        return (
          <ProcessTokenView
            key={item.token.id}
            placed={parked}
            hidePentagon={item.token.type === "start"}
            pentagonImage={
              item.token.type === "start" ? pentagonImage : undefined
            }
            pentagonArt={item.token.type === "start" ? pentagonArt : undefined}
            seatedTurn={item.token.type === "start" ? (seated?.turn ?? 0) : 0}
            selected={
              item.token.id === selectedId ||
              (item.token.type === "start" && seated?.id === selectedId)
            }
            selectLabel={
              item.token.type === "start" ? seated?.label : undefined
            }
            onSelect={selectHandler(item, seated, onSelect)}
            behind={radarFront}
          />
        );
      })}
      {selectedOutline ? (
        <TokenChrome
          points={selectedOutline}
          viewScale={view.scale}
          behind={radarFront}
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
        onClose={onCloseMenu}
        onFitRadial={onFitRadial}
        gradientHost={gradientHost}
        processTokens={tokens}
        viewportRef={viewportRef}
        view={view}
        markedIndex={nextAddSeam(tokens, selectedId)}
        placeholderOpen={gapOpen}
        switchOrigin={switchOrigin}
      />
    </>
  );
}

/** Keep the chain recessed until the radar plate has finished leaving. */
function useRadarHold(open: boolean) {
  const [held, setHeld] = useState(open);
  useEffect(() => {
    if (open) {
      setHeld(true);
      return;
    }
    const id = window.setTimeout(() => setHeld(false), 380);
    return () => window.clearTimeout(id);
  }, [open]);
  return held;
}

/** The first chain token, drawn into the starting-point pentagon in place of the blue fill. */
function seatedToken(tokens: ProcessToken[]): ProcessToken | null {
  const first = tokens
    .filter((token) => token.type === "phase" || token.type === "activity")
    .sort((a, b) => a.order - b.order)[0];
  if (!first || !geometryFor(first).outline) return null;
  return first;
}

function selectHandler(
  item: PlacedToken,
  seated: ProcessToken | null,
  onSelect: (id: string) => void,
): (() => void) | undefined {
  if (
    item.token.type === "phase" ||
    item.token.type === "activity" ||
    item.token.type === "checkpoint"
  ) {
    return () => onSelect(item.token.id);
  }
  if (item.token.type === "start" && seated) return () => onSelect(seated.id);
  return undefined;
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
