import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasView } from "../canvas/useCanvasView";
import { useExplorationCamera } from "../exploration/useExplorationCamera";
import {
  duplicateSelectedTokens,
  duplicateToken,
  removeSelectedTokens,
  removeToken,
  replaceToken,
  rotateToken,
} from "../process/editToken";
import {
  downloadBlob,
  exportSelectedTokensPng,
} from "../process/exportSelected";
import { insertToken } from "../process/insertToken";
import { canReflectOnSelection } from "../reflection/reflectionContext";
import { useReflectionSession } from "../reflection/useReflectionSession";
import type { ScreenRect } from "../process/multiSelect";
import { initialProcess } from "../process/processTestData";
import type { ProcessToken } from "../process/processTypes";
import type { CatalogEntry, MenuCategory } from "../process/tokenCatalog";
import { Canvas } from "./Canvas";
import { Header, INITIAL_PROJECT, type ProjectDetails } from "./Header";
import { LeftToolbar, type CanvasTool } from "./LeftToolbar";
import { ProcessCanvas } from "./ProcessCanvas";
import { AIReflectionPanel } from "./reflection/AIReflectionPanel";
import { UndoRedo } from "./UndoRedo";
import type { SelectOptions } from "./useProcessDrag";
import { ZoomControls } from "./ZoomControls";
import "./AppShell.css";

type ProcessSnapshot = {
  tokens: ProcessToken[];
  insertion: number;
  session: boolean;
};

export function AppShell() {
  /** Starts in Add so empty-canvas drag pans. Select must be chosen to pick tokens. */
  const [tool, setTool] = useState<CanvasTool>("add");
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
  const { view, panBy, zoomBy, zoomByPercent, resetZoom, flyTo, getView } =
    useCanvasView();
  const reflection = useReflectionSession();
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
  const selectionEnabled =
    tool === "select" && !canvasLocked && !reflection.isOpen;
  const [sessionAdds, setSessionAdds] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const tokensRef = useRef(tokens);
  const insertionRef = useRef(activeInsertion);
  const pastRef = useRef<ProcessSnapshot[]>([]);
  const futureRef = useRef<ProcessSnapshot[]>([]);
  const pickLock = useRef(false);
  const sessionHead = useRef(false);
  const historyRef = useRef({ undo: () => {}, redo: () => {} });
  tokensRef.current = tokens;
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
      if (reflection.isOpen) {
        event.preventDefault();
        reflection.close();
        return;
      }
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
    reflection.close,
    reflection.isOpen,
    selectedIds.length,
  ]);

  function projectInfo() {
    return {
      title: project.name,
      description: project.description,
      designQuestion: project.designQuestion,
      target: project.target,
    };
  }

  function startWholeProcessReflection() {
    reflection.start({
      scope: "whole-process",
      tokens: tokensRef.current,
      selectedIds: [],
      project: projectInfo(),
    });
  }

  function startSelectedReflection() {
    if (!canReflectOnSelection(tokensRef.current, selectedIds)) return;
    reflection.start({
      scope: "selected-section",
      tokens: tokensRef.current,
      selectedIds,
      project: projectInfo(),
    });
  }

  function backToProcessFromReflection() {
    reflection.close();
  }

  function exploreActivitiesFromReflection() {
    reflection.close();
    exploreMode("activity");
  }

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
      },
      ...futureRef.current,
    ];
    sessionHead.current = previous.session;
    tokensRef.current = previous.tokens;
    insertionRef.current = previous.insertion;
    setTokens(previous.tokens);
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
      },
    ];
    sessionHead.current = next.session;
    tokensRef.current = next.tokens;
    insertionRef.current = next.insertion;
    setTokens(next.tokens);
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

  function rotateSelected() {
    if (!selectedId) return;
    const current = tokensRef.current;
    const next = rotateToken(current, selectedId);
    if (next === current) return;
    remember();
    sessionHead.current = false;
    tokensRef.current = next;
    setTokens(next);
  }

  function duplicateSelected() {
    if (selectedIds.length === 0) return;
    const current = tokensRef.current;
    if (selectedIds.length === 1) {
      const result = duplicateToken(current, selectedIds[0]);
      if (!result.createdId || result.tokens === current) return;
      remember();
      sessionHead.current = false;
      tokensRef.current = result.tokens;
      setTokens(result.tokens);
      setSelectedIds([result.createdId]);
      closeMenu();
      return;
    }
    const result = duplicateSelectedTokens(current, selectedIds);
    if (result.createdIds.length === 0 || result.tokens === current) return;
    remember();
    sessionHead.current = false;
    tokensRef.current = result.tokens;
    setTokens(result.tokens);
    setSelectedIds(result.createdIds);
    closeMenu();
  }

  async function exportSelection() {
    if (selectedIds.length < 2) return;
    try {
      const blob = await exportSelectedTokensPng(tokensRef.current, selectedIds);
      if (!blob) return;
      downloadBlob(blob, "groow-selected-tokens.png");
    } catch {
      // Image load failures leave the process unchanged.
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
      <Header details={project} onChange={setProject} />
      <main className="workspace">
        <Canvas
          viewportRef={viewportRef}
          view={view}
          onPanBy={panBy}
          onZoomBy={zoomBy}
          onBackgroundClick={selectionEnabled ? clearSelection : undefined}
          boxSelectEnabled={selectionEnabled}
          onBoxSelectMove={updateMarquee}
          onBoxSelectEnd={applyBoxSelection}
          locked={canvasLocked || reflection.isOpen}
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
            replaceId={replaceId}
            selectionEnabled={selectionEnabled}
            onSelect={selectToken}
            gapOpen={gapOpen && !replaceId}
            onRemove={removeSelection}
            onRotate={rotateSelected}
            onSwitch={switchSelected}
            onCopySelected={duplicateSelected}
            onExportSelected={exportSelection}
            onReflectSelected={
              !reflection.isOpen &&
              canReflectOnSelection(tokens, selectedIds)
                ? startSelectedReflection
                : undefined
            }
            onReorder={commitReorder}
            onPanBy={panBy}
            explorationActive={canvasLocked}
            explorationAtmosphere={atmosphere}
            explorationSplit={split}
            splitOpen={exploring}
            atmosphereHost={atmosphereHost}
          />
        </Canvas>
        <LeftToolbar
          tool={tool}
          onToolChange={(next) => {
            if (next !== "select") clearSelection();
            setTool(next);
          }}
          onReflect={startWholeProcessReflection}
        />
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
        {reflection.isOpen ? (
          <AIReflectionPanel
            snapshot={reflection.snapshot}
            onClose={reflection.close}
            onAnswerChange={reflection.setDraftAnswer}
            onContinue={() => {
              if (reflection.snapshot.busy) return;
              reflection.submitAnswer();
            }}
            onRetry={reflection.retryGeneration}
            onContinueWithoutAi={reflection.continueWithFallback}
            onBackToProcess={backToProcessFromReflection}
            onExploreActivities={exploreActivitiesFromReflection}
            onSave={() => {
              reflection.saveCurrent();
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
