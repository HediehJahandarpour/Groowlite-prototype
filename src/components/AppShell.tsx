import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasView } from "../canvas/useCanvasView";
import { removeToken, replaceToken } from "../process/editToken";
import { insertToken } from "../process/insertToken";
import { initialProcess } from "../process/processTestData";
import type { ProcessToken } from "../process/processTypes";
import type { CatalogEntry, MenuCategory } from "../process/tokenCatalog";
import { Canvas } from "./Canvas";
import { Header } from "./Header";
import { LeftToolbar, type CanvasTool } from "./LeftToolbar";
import { ProcessCanvas } from "./ProcessCanvas";
import { UndoRedo } from "./UndoRedo";
import { ZoomControls } from "./ZoomControls";
import "./AppShell.css";

type ProcessSnapshot = {
  tokens: ProcessToken[];
  insertion: number;
  session: boolean;
};

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
  const { view, panBy, zoomBy, zoomByPercent, resetZoom } = useCanvasView();
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

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setCategory(null);
    setReplaceId(null);
    setGapOpen(false);
    setSessionAdds(0);
    sessionHead.current = false;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setReplaceId(null);
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
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isTypingTarget(event.target) || !selectedId) return;
      event.preventDefault();
      const current = tokensRef.current;
      const next = removeToken(current, selectedId);
      if (next === current) return;
      remember();
      sessionHead.current = false;
      tokensRef.current = next;
      setTokens(next);
      clearSelection();
      closeMenu();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection, closeMenu, selectedId]);

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
    if (next.session) setSessionAdds((count) => count + 1);
  }

  historyRef.current = { undo, redo };

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
    const current = tokensRef.current;
    const next = removeToken(current, selectedId);
    if (next === current) return;
    remember();
    sessionHead.current = false;
    tokensRef.current = next;
    setTokens(next);
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
            onExploreMode={exploreMode}
            addedCount={sessionAdds}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onCloseMenu={closeMenu}
            viewportRef={viewportRef}
            view={view}
            selectedId={selectedId}
            replaceId={replaceId}
            onSelect={selectToken}
            gapOpen={gapOpen && !replaceId}
            onRemove={removeSelected}
            onSwitch={switchSelected}
            onReorder={commitReorder}
            onPanBy={panBy}
          />
        </Canvas>
        <LeftToolbar tool={tool} onToolChange={setTool} />
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
