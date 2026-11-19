import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasView } from "../canvas/useCanvasView";
import { useExplorationCamera } from "../exploration/useExplorationCamera";
import {
  removeSelectedTokens,
  removeToken,
  replaceToken,
} from "../process/editToken";
import {
  downloadBlob,
  exportProcessPng,
  exportSelectedTokensPng,
  processExportFilename,
} from "../process/exportSelected";
import { applySlotStamp } from "../process/overviewStamps";
import { insertToken } from "../process/insertToken";
import type { ScreenRect } from "../process/multiSelect";
import { initialProcess } from "../process/processTestData";
import type { OverviewStampId, ProcessToken, SlotStamps } from "../process/processTypes";
import type { CatalogEntry, MenuCategory } from "../process/tokenCatalog";
import { Canvas } from "./Canvas";
import { Header, INITIAL_PROJECT, type ProjectDetails } from "./Header";
import { LeftToolbar } from "./LeftToolbar";
import { OverviewToolbar } from "./OverviewToolbar";
import { ProcessCanvas } from "./ProcessCanvas";
import { UndoRedo } from "./UndoRedo";
import type { SelectOptions } from "./useProcessDrag";
import { ZoomControls } from "./ZoomControls";
import "./AppShell.css";

type ProcessSnapshot = {
  tokens: ProcessToken[];
  insertion: number;
  session: boolean;
  stamps: SlotStamps;
};

export function AppShell() {
  const [tokens, setTokens] = useState<ProcessToken[]>(initialProcess);
  const [project, setProject] = useState<ProjectDetails>(INITIAL_PROJECT);
  const [activeInsertion, setActiveInsertion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState<MenuCategory | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marqueeRect, setMarqueeRect] = useState<ScreenRect | null>(null);
  const [marqueeAdditive, setMarqueeAdditive] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [gapOpen, setGapOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [atmosphereHost, setAtmosphereHost] = useState<HTMLDivElement | null>(null);
  const hitTestRef = useRef<(rect: ScreenRect) => string[]>(() => []);
  const tokenAtRef = useRef<(clientX: number, clientY: number) => string | null>(
    () => null,
  );
  const [armedStamp, setArmedStamp] = useState<OverviewStampId | null>(null);
  const [stampTargetId, setStampTargetId] = useState<string | null>(null);
  const [slotStamps, setSlotStamps] = useState<SlotStamps>({});
  const { view, panBy, zoomBy, zoomByPercent, resetZoom, flyTo, getView } =
    useCanvasView();
  const exploring =
    category === "phase" || category === "activity" || category === "checkpoint";
  const { atmosphere, split } = useExplorationCamera({
    active: exploring,
    tokens,
    insertionIndex: activeInsertion,
    replaceId,
    viewportRef,
    getView,
    flyTo,
  });
  const canvasLocked = exploring || atmosphere > 0;
  /** Click a token or drag a marquee anytime the canvas is free. Scroll to pan. */
  const selectionEnabled = !canvasLocked;
  const [sessionAdds, setSessionAdds] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const tokensRef = useRef(tokens);
  const stampsRef = useRef(slotStamps);
  const insertionRef = useRef(activeInsertion);
  const pastRef = useRef<ProcessSnapshot[]>([]);
  const futureRef = useRef<ProcessSnapshot[]>([]);
  const pickLock = useRef(false);
  const sessionHead = useRef(false);
  const historyRef = useRef({ undo: () => {}, redo: () => {} });
  tokensRef.current = tokens;
  stampsRef.current = slotStamps;
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setCategory(null);
    setReplaceId(null);
    setGapOpen(false);
    setSessionAdds(0);
    sessionHead.current = false;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setReplaceId(null);
    setMarqueeRect(null);
    setMarqueeAdditive(false);
  }, []);

  const updateMarquee = useCallback((rect: ScreenRect | null, additive: boolean) => {
    setMarqueeRect(rect);
    setMarqueeAdditive(Boolean(rect) && additive);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
        return;
      event.preventDefault();
      if (event.shiftKey) historyRef.current.redo();
      else historyRef.current.undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isTypingTarget(event.target)) return;
      if (document.documentElement.classList.contains("is-reordering")) return;
      if (selectedIds.length === 0 && !marqueeRect) return;
      event.preventDefault();
      clearSelection();
      closeMenu();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    clearSelection,
    closeMenu,
    marqueeRect,
    selectedIds.length,
  ]);

  function activateInsertion(index: number) {
    insertionRef.current = index;
    setActiveInsertion(index);
    setReplaceId(null);
    setMenuOpen(false);
    setCategory(null);
    setGapOpen(true);
  }

  function exploreMode(next: MenuCategory) {
    setMenuOpen(true);
    setGapOpen(true);
    setCategory(next);
  }

  function remember() {
    pastRef.current = [
      ...pastRef.current,
      {
        tokens: tokensRef.current,
        insertion: insertionRef.current,
        session: sessionHead.current,
        stamps: stampsRef.current,
      },
    ];
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  function undo() {
    const previous = pastRef.current.at(-1);
    if (!previous) return;
    const leavingSession = sessionHead.current;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [
      {
        tokens: tokensRef.current,
        insertion: insertionRef.current,
        session: leavingSession,
        stamps: stampsRef.current,
      },
      ...futureRef.current,
    ];
    sessionHead.current = previous.session;
    tokensRef.current = previous.tokens;
    stampsRef.current = previous.stamps;
    insertionRef.current = previous.insertion;
    setTokens(previous.tokens);
    setSlotStamps(previous.stamps);
    setActiveInsertion(previous.insertion);
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
    clearSelection();
    if (leavingSession) setSessionAdds((count) => Math.max(0, count - 1));
  }

  function redo() {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [
      ...pastRef.current,
      {
        tokens: tokensRef.current,
        insertion: insertionRef.current,
        session: sessionHead.current,
        stamps: stampsRef.current,
      },
    ];
    sessionHead.current = next.session;
    tokensRef.current = next.tokens;
    stampsRef.current = next.stamps;
    insertionRef.current = next.insertion;
    setTokens(next.tokens);
    setSlotStamps(next.stamps);
    setActiveInsertion(next.insertion);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
    clearSelection();
    if (next.session) setSessionAdds((count) => count + 1);
  }

  historyRef.current = { undo, redo };

  function chooseCategory(next: MenuCategory) {
    setMenuOpen(true);
    setCategory((current) => (current === next ? null : next));
  }

  function selectToken(id: string, options?: SelectOptions) {
    setReplaceId(null);
    setMenuOpen(false);
    setCategory(null);
    setGapOpen(false);
    setMarqueeRect(null);
    if (options?.toggle) {
      setSelectedIds((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      );
      return;
    }
    setSelectedIds([id]);
  }

  function applyBoxSelection(rect: ScreenRect | null, additive: boolean) {
    setMarqueeRect(null);
    setMarqueeAdditive(false);
    if (!rect) return;
    const hits = hitTestRef.current(rect);
    if (hits.length === 0) {
      if (!additive) clearSelection();
      return;
    }
    if (additive) {
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const id of hits) next.add(id);
        return [...next];
      });
      return;
    }
    setSelectedIds(hits);
    setReplaceId(null);
    setMenuOpen(false);
    setCategory(null);
    setGapOpen(false);
  }

  function removeSelection() {
    if (selectedIds.length === 0) return;
    const current = tokensRef.current;
    const next =
      selectedIds.length === 1
        ? removeToken(current, selectedIds[0])
        : removeSelectedTokens(current, selectedIds);
    if (next === current) return;
    remember();
    sessionHead.current = false;
    tokensRef.current = next;
    setTokens(next);
    clearSelection();
    closeMenu();
  }

  const removeSelectionRef = useRef(removeSelection);
  const selectedIdsRef = useRef(selectedIds);
  removeSelectionRef.current = removeSelection;
  selectedIdsRef.current = selectedIds;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isTypingTarget(event.target) || selectedIdsRef.current.length === 0) return;
      event.preventDefault();
      removeSelectionRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const alive = new Set(tokens.map((token) => token.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => alive.has(id));
      return next.length === current.length ? current : next;
    });
  }, [tokens]);

  const exportLock = useRef(false);
  const [exporting, setExporting] = useState(false);

  async function exportProcess() {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    try {
      const blob = await exportProcessPng(tokensRef.current);
      if (!blob) return;
      downloadBlob(blob, processExportFilename(project.name));
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }

  async function exportSelection() {
    if (exportLock.current || selectedIdsRef.current.length === 0) return;
    exportLock.current = true;
    try {
      const blob = await exportSelectedTokensPng(
        tokensRef.current,
        selectedIdsRef.current,
      );
      if (!blob) return;
      const count = selectedIdsRef.current.length;
      downloadBlob(
        blob,
        count === 1 ? "token.png" : `tokens-${count}.png`,
      );
    } finally {
      exportLock.current = false;
    }
  }

  function switchSelected() {
    const token = tokens.find((item) => item.id === selectedId);
    if (!token || (token.type !== "phase" && token.type !== "activity")) return;
    setGapOpen(false);
    setReplaceId(token.id);
    setMenuOpen(true);
    setCategory(token.type);
  }

  function commitReorder(next: ProcessToken[]) {
    if (next === tokensRef.current) return;
    remember();
    sessionHead.current = false;
    tokensRef.current = next;
    setTokens(next);
  }

  function placeStamp(slotIndex: string, stampId: OverviewStampId | null) {
    if (!stampId) return;
    const next = applySlotStamp(stampsRef.current, slotIndex, stampId);
    if (next === stampsRef.current) return;
    remember();
    sessionHead.current = false;
    stampsRef.current = next;
    setSlotStamps(next);
  }

  function pickToken(entry: CatalogEntry, keepOpen = false) {
    if (pickLock.current) return;
    if (replaceId) {
      const current = tokensRef.current;
      const next = replaceToken(current, replaceId, entry);
      if (next === current) return;
      remember();
      sessionHead.current = false;
      tokensRef.current = next;
      setTokens(next);
      closeMenu();
      return;
    }
    const at = insertionRef.current;
    const current = tokensRef.current;
    const next = insertToken(current, at, entry);
    if (next === current) return;
    pickLock.current = true;
    remember();
    sessionHead.current = keepOpen;
    tokensRef.current = next;
    insertionRef.current = at + 1;
    setTokens(next);
    setActiveInsertion(at + 1);
    if (keepOpen) setSessionAdds((count) => count + 1);
    if (!keepOpen) closeMenu();
    window.setTimeout(() => {
      pickLock.current = false;
    }, 160);
  }

  return (
    <div
      className={
        canvasLocked ? "app-shell app-shell--exploring" : "app-shell"
      }
      style={{ ["--atmosphere" as string]: atmosphere }}
    >
      <Header
        details={project}
        onChange={setProject}
        exporting={exporting}
        onExport={() => {
          void exportProcess();
        }}
      />
      <main className="workspace">
        <Canvas
          viewportRef={viewportRef}
          view={view}
          onPanBy={panBy}
          onZoomBy={zoomBy}
          onBackgroundClick={
            selectionEnabled
              ? () => {
                  clearSelection();
                  setArmedStamp(null);
                }
              : undefined
          }
          boxSelectEnabled={selectionEnabled}
          onBoxSelectMove={updateMarquee}
          onBoxSelectEnd={applyBoxSelection}
          locked={canvasLocked}
          atmosphere={atmosphere}
          atmosphereRef={setAtmosphereHost}
        >
          <ProcessCanvas
            tokens={tokens}
            activeInsertion={activeInsertion}
            menuOpen={menuOpen}
            category={category}
            onActivate={activateInsertion}
            onCategory={chooseCategory}
            onPick={pickToken}
            onExploreMode={exploreMode}
            addedCount={sessionAdds}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onCloseMenu={closeMenu}
            viewportRef={viewportRef}
            view={view}
            selectedIds={selectionEnabled ? selectedIds : []}
            marqueeRect={selectionEnabled ? marqueeRect : null}
            marqueeAdditive={marqueeAdditive}
            hitTestRef={hitTestRef}
            tokenAtRef={tokenAtRef}
            slotStamps={slotStamps}
            stampTargetId={stampTargetId}
            stamping={armedStamp != null}
            onStamp={(tokenId) => placeStamp(tokenId, armedStamp)}
            replaceId={replaceId}
            selectionEnabled={selectionEnabled}
            onSelect={selectToken}
            gapOpen={gapOpen && !replaceId}
            onRemove={removeSelection}
            onExport={() => {
              void exportSelection();
            }}
            onSwitch={switchSelected}
            onReorder={commitReorder}
            onPanBy={panBy}
            explorationActive={canvasLocked}
            explorationAtmosphere={atmosphere}
            explorationSplit={split}
            splitOpen={exploring}
            atmosphereHost={atmosphereHost}
          />
        </Canvas>
        <LeftToolbar />
        {canvasLocked ? null : (
          <OverviewToolbar
            armedId={armedStamp}
            onArm={setArmedStamp}
            onDragOver={(clientX, clientY) => {
              const id = tokenAtRef.current(clientX, clientY);
              setStampTargetId((current) => (current === id ? current : id));
            }}
            onDrop={(stampId, clientX, clientY) => {
              const id = tokenAtRef.current(clientX, clientY);
              if (id) placeStamp(id, stampId);
            }}
            onDragEnd={() => setStampTargetId(null)}
          />
        )}
        <UndoRedo
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
        />
        <ZoomControls
          scale={view.scale}
          viewportRef={viewportRef}
          onZoomByPercent={zoomByPercent}
          onResetZoom={resetZoom}
        />
      </main>
    </div>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
