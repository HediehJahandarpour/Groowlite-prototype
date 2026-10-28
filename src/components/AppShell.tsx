import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasView } from "../canvas/useCanvasView";
import { removeToken, replaceToken } from "../process/editToken";
import { insertToken } from "../process/insertToken";
import { fitCamera, type WorldBounds } from "../process/radialLayout";
import { initialProcess } from "../process/processTestData";
import type { ProcessToken } from "../process/processTypes";
import type { CatalogEntry, MenuCategory } from "../process/tokenCatalog";
import { Canvas } from "./Canvas";
import { Header } from "./Header";
import { LeftToolbar, type CanvasTool } from "./LeftToolbar";
import { ProcessCanvas } from "./ProcessCanvas";
import { RecommendationDebug } from "./RecommendationDebug";
import { UndoRedo } from "./UndoRedo";
import { ZoomControls } from "./ZoomControls";
import "./AppShell.css";
import "./RecommendationDebug.css";

export function AppShell() {
  const [tool, setTool] = useState<CanvasTool>("select");
  const [tokens, setTokens] = useState<ProcessToken[]>(initialProcess);
  const [activeInsertion, setActiveInsertion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState<MenuCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [gapOpen, setGapOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { view, panBy, zoomBy, zoomByPercent, resetZoom, adjustView } =
    useCanvasView();
  const [debugOpen, setDebugOpen] = useState(() => debugRequested());

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    function onKey(event: KeyboardEvent) {
      if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "d")
        return;
      setDebugOpen((open) => !open);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setCategory(null);
    setReplaceId(null);
    setGapOpen(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setReplaceId(null);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isTypingTarget(event.target) || !selectedId) return;
      event.preventDefault();
      setTokens((current) => removeToken(current, selectedId));
      clearSelection();
      closeMenu();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection, closeMenu, selectedId]);

  function activateInsertion(index: number) {
    setActiveInsertion(index);
    setReplaceId(null);
    setMenuOpen(false);
    setCategory(null);
    setGapOpen(true);
  }

  function chooseCategory(next: MenuCategory) {
    setMenuOpen(true);
    setCategory((current) => (current === next ? null : next));
  }

  function selectToken(id: string) {
    setSelectedId(id);
    setReplaceId(null);
    setMenuOpen(false);
    setCategory(null);
    setGapOpen(false);
  }

  function removeSelected() {
    if (!selectedId) return;
    setTokens((current) => removeToken(current, selectedId));
    clearSelection();
    closeMenu();
  }

  function switchSelected() {
    const token = tokens.find((item) => item.id === selectedId);
    if (!token || (token.type !== "phase" && token.type !== "activity")) return;
    setGapOpen(false);
    setReplaceId(token.id);
    setMenuOpen(true);
    setCategory(token.type);
  }

  function pickToken(entry: CatalogEntry) {
    if (replaceId) {
      setTokens((current) => replaceToken(current, replaceId, entry));
      closeMenu();
      return;
    }
    if (activeInsertion <= 0 && entry.type !== "phase") return;
    setTokens((current) => insertToken(current, activeInsertion, entry));
    setActiveInsertion((index) => index + 1);
    closeMenu();
  }

  const revealRadial = useCallback(
    (bounds: WorldBounds) => {
      const frame = viewportRef.current;
      if (!frame) return;
      adjustView((current) =>
        fitCamera(current, bounds, frame.clientWidth, frame.clientHeight),
      );
    },
    [adjustView],
  );

  return (
    <div className="app-shell">
      <Header />
      <main className="workspace">
        <Canvas
          viewportRef={viewportRef}
          view={view}
          onPanBy={panBy}
          onZoomBy={zoomBy}
          onBackgroundClick={clearSelection}
        >
          <ProcessCanvas
            tokens={tokens}
            activeInsertion={activeInsertion}
            menuOpen={menuOpen}
            category={category}
            onActivate={activateInsertion}
            onCategory={chooseCategory}
            onPick={pickToken}
            onCloseMenu={closeMenu}
            onFitRadial={revealRadial}
            viewportRef={viewportRef}
            view={view}
            selectedId={selectedId}
            replaceId={replaceId}
            onSelect={selectToken}
            gapOpen={gapOpen && !replaceId}
            onRemove={removeSelected}
            onSwitch={switchSelected}
          />
        </Canvas>
        <LeftToolbar tool={tool} onToolChange={setTool} />
        <UndoRedo />
        <ZoomControls
          scale={view.scale}
          viewportRef={viewportRef}
          onZoomByPercent={zoomByPercent}
          onResetZoom={resetZoom}
        />
        {import.meta.env.DEV ? (
          <button
            type="button"
            className="recommend-debug-toggle"
            aria-pressed={debugOpen}
            onClick={() => setDebugOpen((open) => !open)}
          >
            Recommendation debug
          </button>
        ) : null}
        {import.meta.env.DEV && debugOpen ? (
          <RecommendationDebug
            tokens={tokens}
            insertionIndex={activeInsertion}
            onClose={() => setDebugOpen(false)}
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

function debugRequested(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("debug") ===
    "recommendations"
  );
}
