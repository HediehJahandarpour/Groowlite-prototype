import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { worldToScreen, type CanvasView } from "../canvas/view";
import type { ScreenRect } from "../exploration/cameraFocus";
import {
  nextPlaceholder,
  plusPoint,
  seamPoint,
} from "../process/insertionPoint";
import { imageToWorld } from "../process/slotLayout";
import {
  TOKEN_CATALOG,
  type CatalogEntry,
  type MenuCategory,
} from "../process/tokenCatalog";
import {
  centroid,
  geometryFor,
  START_PENTAGON,
} from "../process/tokenGeometry";
import { tokenTransform } from "../process/processLayout";
import type {
  PlacedToken,
  Point,
  ProcessSlot,
  ProcessToken,
} from "../process/processTypes";
import { ImmersiveTokenExplorer } from "./exploration/ImmersiveTokenExplorer";
import "./InsertionMenu.css";

const EMPTY_ZONES: ScreenRect[] = [];

type InsertionMenuProps = {
  placed: PlacedToken[];
  slots: ProcessSlot[];
  occupied: number;
  /** The first chosen token fills the blue pentagon, so seams after it start one slot earlier. */
  phaseInStart: boolean;
  activeIndex: number;
  open: boolean;
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
  onClose: () => void;
  processTokens: ProcessToken[];
  replaceId: string | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Camera. The plus is drawn in screen space, so zoom does not scale it. */
  view: CanvasView;
  /** Seam after the activity. The plus stays here so the next token can be added. */
  markedIndex: number | null;
  /** Add toolbar is open after the plus is clicked. Switch leaves this closed. */
  placeholderOpen: boolean;
  /** World point where Switch opens the phase or activity picker. */
  switchOrigin: Point | null;
  /** Hide the add controls while a token is being reordered. */
  suspended?: boolean;
  explorationActive?: boolean;
  explorationAtmosphere?: number;
  explorationZones?: ScreenRect[];
  atmosphereHost?: HTMLElement | null;
};

/** Temporary list, in world pixels, to the right of the blue pentagon. */
const PICKER_OFFSET: Record<MenuCategory, Point> = {
  phase: { x: 130, y: 52 },
  activity: { x: 240, y: 24 },
  checkpoint: { x: 240, y: 48 },
};

const BLUE_CENTER = centroid(START_PENTAGON);

function stopPointer(event: ReactPointerEvent) {
  event.stopPropagation();
}

export function InsertionMenu({
  placed,
  slots,
  occupied,
  phaseInStart,
  activeIndex,
  open,
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
  onClose,
  processTokens,
  replaceId,
  viewportRef,
  view,
  markedIndex,
  placeholderOpen,
  switchOrigin,
  suspended = false,
  explorationActive = false,
  explorationAtmosphere = 0,
  explorationZones = EMPTY_ZONES,
  atmosphereHost = null,
}: InsertionMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const seamRef = useRef<HTMLDivElement>(null);
  const [seamHost, setSeamHost] = useState<HTMLElement | null>(null);
  const [explorerMode, setExplorerMode] = useState<MenuCategory | null>(null);
  const start = placed.find((item) => item.token.type === "start");
  const phaseOpen = category === "phase";
  const activityOpen = category === "activity";
  const checkpointOpen = category === "checkpoint";

  if (
    (category === "phase" ||
      category === "activity" ||
      category === "checkpoint") &&
    explorerMode !== category
  ) {
    setExplorerMode(category);
  }

  useEffect(() => {
    if (
      category === "phase" ||
      category === "activity" ||
      category === "checkpoint"
    ) {
      return;
    }
    const id = window.setTimeout(() => setExplorerMode(null), 1000);
    return () => window.clearTimeout(id);
  }, [category]);

  useLayoutEffect(() => {
    const node = viewportRef.current ?? document.querySelector(".canvas");
    if (node instanceof HTMLElement) {
      setSeamHost((current) => (current === node ? current : node));
    }
  });

  const dismissible = open || placeholderOpen;

  useEffect(() => {
    if (!dismissible) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    let dragUp: ((event: PointerEvent) => void) | null = null;

    function onPointerDown(event: PointerEvent) {
      const targetNode = event.target;
      const insideMenu =
        targetNode instanceof Node &&
        ((rootRef.current?.contains(targetNode) ?? false) ||
          (seamRef.current?.contains(targetNode) ?? false));
      if (insideMenu) return;
      const target = event.target;
      const onFilter =
        target instanceof Element &&
        Boolean(
          target.closest(
            ".activity-filter, .token-toolbar, .immersive-explorer",
          ),
        );
      if (onFilter) return;
      const onChrome =
        target instanceof Element &&
        Boolean(target.closest(".header, .toolbar"));
      if (onChrome) return;
      const onCanvas =
        target instanceof Element && Boolean(target.closest(".canvas"));
      if (!onCanvas) {
        onClose();
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      dragUp = (up: PointerEvent) => {
        window.removeEventListener("pointerup", dragUp!);
        dragUp = null;
        const moved = Math.hypot(up.clientX - startX, up.clientY - startY);
        if (moved > 5) return;
        onClose();
      };
      window.addEventListener("pointerup", dragUp);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
      if (dragUp) window.removeEventListener("pointerup", dragUp);
    };
  }, [dismissible, onClose]);

  if (!start) return null;
  const origin = start;

  const pose = menuPose(activeIndex, start, slots, phaseInStart);
  const labelAngle = -((pose.heading * 180) / Math.PI);
  const listCategory = null as MenuCategory | null;
  const choices = listCategory ? TOKEN_CATALOG[listCategory] : [];
  const pickerAt = listCategory
    ? pickerPoint(PICKER_OFFSET[listCategory], pose)
    : null;
  const explorerOpen = phaseOpen || activityOpen || checkpointOpen;
  const pickerBusy =
    explorerOpen || explorerMode !== null || Boolean(switchOrigin);

  function chooseAt(index: number, id: MenuCategory) {
    if (!phaseInStart && index <= 0 && id !== "phase") return;
    onActivate(index);
    if (id !== "checkpoint") {
      onCategory(id);
      return;
    }
    const entry = TOKEN_CATALOG.checkpoint[0];
    if (entry) onPick(entry);
  }

  function seamControls() {
    const chain = processTokens
      .filter(
        (token) =>
          token.type === "phase" ||
          token.type === "activity" ||
          token.type === "checkpoint",
      )
      .slice()
      .sort((a, b) => a.order - b.order);
    return Array.from({ length: occupied + 1 }, (_, index) => {
      if (switchOrigin && index === markedIndex) return null;
      if (phaseInStart && index === 0) return null;
      const point =
        index === markedIndex
          ? plusPoint(index, origin, slots, phaseInStart)
          : seamPoint(index, origin, slots, phaseInStart);
      const screenPoint = worldToScreen(view, point.x, point.y);
      const beforePhase = chain[index]?.type === "phase";
      const resting =
        !beforePhase &&
        (index === markedIndex || (!phaseInStart && index === 0));
      const holding = pickerBusy && index === activeIndex;
      return (
        <div
          key={index}
          className="insertion-seam-anchor"
          style={{
            left: screenPoint.x,
            top: screenPoint.y,
          }}
        >
          <div
            className={[
              "insertion-seam",
              holding ? "insertion-seam--holding" : "",
              resting ? "insertion-seam--visible" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onPointerEnter={() => {
              if (document.documentElement.classList.contains("is-reordering")) return;
              onActivate(index);
            }}
          >
            <button
              type="button"
              className="insertion-seam__plus"
              aria-label={`Add a phase at position ${index + 1}`}
              aria-expanded={holding}
              onClick={() => chooseAt(index, "phase")}
            />
          </div>
        </div>
      );
    });
  }

  return (
    <div className="insertion-layer" ref={rootRef} onPointerDown={stopPointer}>
      {seamHost && !suspended && !explorationActive
        ? createPortal(
            <div
              className="insertion-seams"
              ref={seamRef}
              onPointerDown={stopPointer}
            >
              {seamControls()}
            </div>,
            seamHost,
          )
        : null}

      {explorerMode === "phase" ||
      explorerMode === "activity" ||
      explorerMode === "checkpoint" ? (
        <ImmersiveTokenExplorer
          open={explorerOpen}
          mode={explorerMode}
          tokens={processTokens}
          insertionIndex={activeIndex}
          replaceId={replaceId}
          onPick={(entry) => onPick(entry, true)}
          onMode={onExploreMode}
          addedCount={addedCount}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onClose={onClose}
          atmosphere={explorationAtmosphere}
          zones={explorationZones}
          atmosphereHost={atmosphereHost}
        />
      ) : null}

      {open && listCategory && pickerAt ? (
        <div
          className="insertion-picker"
          role="group"
          aria-label={`Choose a ${listCategory} token`}
          style={{
            left: pickerAt.x,
            top: pickerAt.y,
            transform: `translate(-50%, -50%) rotate(${labelAngle}deg)`,
          }}
        >
          {choices.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="insertion-picker__option"
              onClick={() => onPick(entry)}
            >
              <img src={`/tokens/${entry.asset}`} alt="" />
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function pickerPoint(offset: Point, pose: MenuPose): Point {
  const placed = imageToWorld(
    BLUE_CENTER,
    pose.anchor,
    pose.origin,
    pose.heading,
    pose.scale,
  );
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  return {
    x: placed.x + offset.x * cos - offset.y * sin,
    y: placed.y + offset.x * sin + offset.y * cos,
  };
}

type MenuPose = {
  transform: string;
  heading: number;
  /** Degrees that turn the choice layout onto the pentagon's own rotation. */
  spin: number;
  drawPentagon: boolean;
  origin: Point;
  anchor: Point;
  scale: number;
};

function menuPose(
  index: number,
  start: PlacedToken,
  slots: ProcessSlot[],
  phaseInStart: boolean,
): MenuPose {
  if (index <= 0) {
    return {
      transform: tokenTransform(start),
      heading: 0,
      spin: 0,
      drawPentagon: false,
      origin: { x: start.x, y: start.y },
      anchor: geometryFor(start.token).anchor,
      scale: start.scale,
    };
  }
  const slot = nextPlaceholder(index, slots, phaseInStart);
  if (!slot) {
    return {
      transform: tokenTransform(start),
      heading: 0,
      spin: 0,
      drawPentagon: false,
      origin: { x: start.x, y: start.y },
      anchor: geometryFor(start.token).anchor,
      scale: start.scale,
    };
  }
  const center = centroid(slot.polygon);
  const scale = start.scale;
  const spin = ((slot.rotation - Math.PI / 2) * 180) / Math.PI;
  return {
    heading: slot.rotation,
    spin,
    drawPentagon: false,
    origin: center,
    anchor: BLUE_CENTER,
    scale,
    transform: [
      `translate(${center.x}px, ${center.y}px)`,
      `rotate(${spin}deg)`,
      `scale(${scale})`,
      `translate(${-BLUE_CENTER.x}px, ${-BLUE_CENTER.y}px)`,
    ].join(" "),
  };
}

