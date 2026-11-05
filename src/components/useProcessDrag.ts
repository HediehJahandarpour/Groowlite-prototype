import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import gsap from "gsap";
import { screenToWorld, type CanvasView } from "../canvas/view";
import { DRAG } from "../process/dragConfig";
import { lerpPoses, translatedPoses, type DragPose } from "../process/dragPose";
import {
  autoPanDelta,
  chooseDropIndex,
  dropCandidates,
  pickupPoses,
  restingPoses,
  type DropCandidate,
} from "../process/dragTargets";
import { moveProcessBlock, spanForDrag } from "../process/reorderToken";
import type { Point, ProcessToken } from "../process/processTypes";

type Session = {
  phase: "dragging" | "settling";
  pointerId: number;
  tokenId: string;
  ids: string[];
  sourceIndex: number;
  count: number;
  activeIndex: number;
  origins: Record<string, DragPose>;
  startWorld: Point;
  baseTokens: ProcessToken[];
  /** True when the settle animation should write the new order. */
  settleCommit: boolean;
};

type Pending = {
  id: string;
  pointerId: number;
  x: number;
  y: number;
};

type ClientPoint = { clientX: number; clientY: number };

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clientToLocal(viewport: HTMLElement, clientX: number, clientY: number) {
  const rect = viewport.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

export type SelectOptions = {
  /** Shift-click toggles membership without clearing the rest. */
  toggle?: boolean;
};

type UseProcessDragArgs = {
  tokens: ProcessToken[];
  view: CanvasView;
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Current selection; a contiguous multi-select drags as one block. */
  selectedIds?: readonly string[];
  onReorder: (tokens: ProcessToken[]) => void;
  onSelect: (id: string, options?: SelectOptions) => void;
  onPanBy: (dx: number, dy: number) => void;
  onCloseMenu: () => void;
};

/**
 * Press-and-move reordering. The process array stays unchanged until a drop
 * lands on a different magnetic index. Previews are derived from that index.
 */
export function useProcessDrag({
  tokens,
  view,
  viewportRef,
  selectedIds = [],
  onReorder,
  onSelect,
  onPanBy,
  onCloseMenu,
}: UseProcessDragArgs) {
  const tokensRef = useRef(tokens);
  const viewRef = useRef(view);
  const selectedIdsRef = useRef(selectedIds);
  const onReorderRef = useRef(onReorder);
  const onSelectRef = useRef(onSelect);
  const onPanByRef = useRef(onPanBy);
  const onCloseMenuRef = useRef(onCloseMenu);
  tokensRef.current = tokens;
  viewRef.current = view;
  selectedIdsRef.current = selectedIds;
  onReorderRef.current = onReorder;
  onSelectRef.current = onSelect;
  onPanByRef.current = onPanBy;
  onCloseMenuRef.current = onCloseMenu;

  const pendingRef = useRef<Pending | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const pointerRef = useRef<ClientPoint | null>(null);
  const liftRef = useRef(1);
  const loopRef = useRef(0);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const liftTweenRef = useRef<gsap.core.Tween | null>(null);
  const settleTimerRef = useRef(0);
  const candidateRef = useRef<{ key: string; list: DropCandidate[] } | null>(null);
  const committingRef = useRef(false);

  const [session, setSession] = useState<Session | null>(null);
  const [pointer, setPointer] = useState<ClientPoint | null>(null);
  const [lift, setLift] = useState(1);
  const [settlePoses, setSettlePoses] = useState<Record<string, DragPose> | null>(null);

  function assignSession(next: Session | null) {
    sessionRef.current = next;
    setSession(next);
  }

  function stopLoop() {
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    loopRef.current = 0;
  }

  function killTweens() {
    tweenRef.current?.kill();
    tweenRef.current = null;
    liftTweenRef.current?.kill();
    liftTweenRef.current = null;
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = 0;
  }

  function clearDrag() {
    stopLoop();
    killTweens();
    pendingRef.current = null;
    pointerRef.current = null;
    candidateRef.current = null;
    liftRef.current = 1;
    assignSession(null);
    setPointer(null);
    setLift(1);
    setSettlePoses(null);
    document.documentElement.classList.remove("is-reordering");
  }

  function candidatesFor(current: Session) {
    const viewNow = viewRef.current;
    const key = [
      current.sourceIndex,
      current.count,
      current.tokenId,
      viewNow.x,
      viewNow.y,
      viewNow.scale,
      current.baseTokens.map((token) => `${token.id}:${token.order}`).join("|"),
    ].join(":");
    const cached = candidateRef.current;
    if (cached?.key === key) return cached.list;
    const list = dropCandidates(
      current.baseTokens,
      current.sourceIndex,
      current.count,
      current.tokenId,
      viewNow,
    );
    candidateRef.current = { key, list };
    return list;
  }

  function magnetFor(current: Session, localX: number, localY: number) {
    const chosen = chooseDropIndex(
      candidatesFor(current),
      { x: localX, y: localY },
      current.activeIndex,
    );
    return chosen ?? current.sourceIndex;
  }

  function syncMagnet(clientX: number, clientY: number) {
    const current = sessionRef.current;
    const viewport = viewportRef.current;
    if (!current || current.phase !== "dragging" || !viewport) return current?.activeIndex ?? 0;
    const rect = viewport.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const nextIndex = magnetFor(current, localX, localY);
    if (nextIndex !== current.activeIndex) {
      const next = { ...current, activeIndex: nextIndex };
      sessionRef.current = next;
      setSession(next);
    }
    return nextIndex;
  }

  function followFrame() {
    const current = sessionRef.current;
    const point = pointerRef.current;
    const viewport = viewportRef.current;
    if (!current || current.phase !== "dragging" || !point || !viewport) return;

    const rect = viewport.getBoundingClientRect();
    const localX = point.clientX - rect.left;
    const localY = point.clientY - rect.top;
    const pan = autoPanDelta(localX, localY, rect.width, rect.height);
    const panned = Math.abs(pan.x) > 0.2 || Math.abs(pan.y) > 0.2;
    if (panned) {
      onPanByRef.current(pan.x, pan.y);
      viewRef.current = {
        ...viewRef.current,
        x: viewRef.current.x + pan.x,
        y: viewRef.current.y + pan.y,
      };
      candidateRef.current = null;
      syncMagnet(point.clientX, point.clientY);
    }
    loopRef.current = requestAnimationFrame(followFrame);
  }

  function posesNow(current: Session) {
    const point = pointerRef.current;
    const viewport = viewportRef.current;
    if (!point || !viewport) return current.origins;
    const local = clientToLocal(viewport, point.clientX, point.clientY);
    const world = screenToWorld(viewRef.current, local.x, local.y);
    return translatedPoses(
      current.origins,
      world.x - current.startWorld.x,
      world.y - current.startWorld.y,
      liftRef.current,
    );
  }

  function finish(commit: boolean) {
    const current = sessionRef.current;
    if (!current) return;
    if (commit) {
      const next = moveProcessBlock(
        current.baseTokens,
        current.sourceIndex,
        current.count,
        current.activeIndex,
      );
      if (next !== current.baseTokens) {
        committingRef.current = true;
        onReorderRef.current(next);
      }
    }
    clearDrag();
  }

  function release(commitIndex: number) {
    const current = sessionRef.current;
    if (!current || current.phase !== "dragging") return;
    stopLoop();
    liftTweenRef.current?.kill();
    liftTweenRef.current = null;
    const committing = commitIndex !== current.sourceIndex;
    const preview = committing
      ? moveProcessBlock(current.baseTokens, current.sourceIndex, current.count, commitIndex)
      : current.baseTokens;
    let to: Record<string, DragPose>;
    try {
      to = restingPoses(preview, current.ids);
    } catch {
      sessionRef.current = {
        ...current,
        phase: "settling",
        activeIndex: commitIndex,
        settleCommit: committing,
      };
      finish(committing);
      return;
    }
    const from = posesNow(current);
    const settling = {
      ...current,
      phase: "settling" as const,
      activeIndex: commitIndex,
      settleCommit: committing,
    };
    sessionRef.current = settling;
    setSession(settling);
    setSettlePoses(from);
    if (reducedMotion()) {
      setSettlePoses(to);
      finish(committing);
      return;
    }
    const durationMs = committing ? DRAG.snapMs : DRAG.cancelMs;
    const proxy = { t: 0 };
    tweenRef.current?.kill();
    gsap.ticker.wake();
    tweenRef.current = gsap.to(proxy, {
      t: 1,
      duration: durationMs / 1000,
      ease: "power2.out",
      onUpdate: () => setSettlePoses(lerpPoses(from, to, proxy.t)),
      onComplete: () => {
        tweenRef.current = null;
        setSettlePoses(to);
        finish(committing);
      },
    });
    // If the ticker never advances, the token must not stay floating.
    settleTimerRef.current = window.setTimeout(() => {
      if (sessionRef.current?.phase !== "settling") return;
      const tween = tweenRef.current;
      tweenRef.current = null;
      tween?.kill();
      setSettlePoses(to);
      finish(committing);
    }, durationMs + 80);
  }

  function finishSettle() {
    const current = sessionRef.current;
    if (!current || current.phase !== "settling") return;
    const commit = current.settleCommit;
    const tween = tweenRef.current;
    tweenRef.current = null;
    tween?.kill();
    finish(commit);
  }

  function startDrag(pending: Pending, clientX: number, clientY: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const baseTokens = tokensRef.current;
    const span = spanForDrag(baseTokens, pending.id, selectedIdsRef.current);
    if (!span) return;
    const local = clientToLocal(viewport, clientX, clientY);
    const startWorld = screenToWorld(viewRef.current, local.x, local.y);
    let origins: Record<string, DragPose>;
    try {
      origins = pickupPoses(baseTokens, span.ids, pending.id);
    } catch {
      return;
    }
    if (!origins[pending.id]) return;

    const next: Session = {
      phase: "dragging",
      pointerId: pending.pointerId,
      tokenId: pending.id,
      ids: span.ids,
      sourceIndex: span.start,
      count: span.count,
      activeIndex: span.start,
      origins,
      startWorld,
      baseTokens,
      settleCommit: false,
    };
    pendingRef.current = null;
    pointerRef.current = { clientX, clientY };
    candidateRef.current = null;
    liftRef.current = 1;
    sessionRef.current = next;
    setSession(next);
    setPointer({ clientX, clientY });
    setLift(1);
    setSettlePoses(null);
    document.documentElement.classList.add("is-reordering");
    onCloseMenuRef.current();

    liftTweenRef.current?.kill();
    if (reducedMotion()) {
      liftRef.current = DRAG.liftScale;
      setLift(DRAG.liftScale);
    } else {
      const proxy = { s: 1 };
      liftTweenRef.current = gsap.to(proxy, {
        s: DRAG.liftScale,
        duration: DRAG.liftMs / 1000,
        ease: "power2.out",
        onUpdate: () => {
          liftRef.current = proxy.s;
          setLift(proxy.s);
        },
      });
    }
    stopLoop();
    loopRef.current = requestAnimationFrame(followFrame);
  }

  const actionsRef = useRef({ startDrag, release, finishSettle });
  actionsRef.current = { startDrag, release, finishSettle };

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const pending = pendingRef.current;
      const drag = sessionRef.current;
      if (pending && !drag) {
        if (event.pointerId !== pending.pointerId) return;
        pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
        if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG.thresholdPx) {
          return;
        }
        actionsRef.current.startDrag(pending, event.clientX, event.clientY);
        return;
      }
      if (!drag || drag.phase !== "dragging" || event.pointerId !== drag.pointerId) return;
      pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (event.pointerType === "mouse" && event.buttons === 0) {
        const index = syncMagnet(event.clientX, event.clientY);
        actionsRef.current.release(index);
        return;
      }
      setPointer({ clientX: event.clientX, clientY: event.clientY });
      syncMagnet(event.clientX, event.clientY);
    }

    function onUp(event: PointerEvent) {
      const pending = pendingRef.current;
      const drag = sessionRef.current;
      if (drag?.phase === "dragging" && event.pointerId === drag.pointerId) {
        pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
        setPointer({ clientX: event.clientX, clientY: event.clientY });
        const index = syncMagnet(event.clientX, event.clientY);
        actionsRef.current.release(index);
        return;
      }
      if (pending && event.pointerId === pending.pointerId && !drag) {
        pendingRef.current = null;
        const selected = selectedIdsRef.current;
        // Keep a multi-selection when clicking a token that is already in it.
        if (
          !event.shiftKey &&
          selected.length >= 2 &&
          selected.includes(pending.id)
        ) {
          return;
        }
        onSelectRef.current(pending.id, { toggle: event.shiftKey });
      }
    }

    function onCancel(event: PointerEvent) {
      const drag = sessionRef.current;
      if (drag?.phase === "dragging" && event.pointerId === drag.pointerId) {
        actionsRef.current.release(drag.sourceIndex);
        return;
      }
      if (pendingRef.current?.pointerId === event.pointerId) pendingRef.current = null;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const drag = sessionRef.current;
      if (!drag && !pendingRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (drag?.phase === "dragging") actionsRef.current.release(drag.sourceIndex);
      else if (drag?.phase === "settling") actionsRef.current.finishSettle();
      else if (!drag) pendingRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopLoop();
      killTweens();
      document.documentElement.classList.remove("is-reordering");
    };
  }, []);

  useEffect(() => {
    if (!session) {
      committingRef.current = false;
      return;
    }
    if (committingRef.current) return;
    if (tokens !== session.baseTokens) clearDrag();
  }, [tokens, session]);

  const displayTokens = useMemo(() => {
    if (!session) return tokens;
    return moveProcessBlock(
      session.baseTokens,
      session.sourceIndex,
      session.count,
      session.activeIndex,
    );
  }, [session, tokens]);

  const floatPoses = useMemo(() => {
    if (!session) return null;
    if (session.phase === "settling" && settlePoses) return settlePoses;
    if (!pointer) return session.origins;
    const viewport = viewportRef.current;
    if (!viewport) return session.origins;
    const local = clientToLocal(viewport, pointer.clientX, pointer.clientY);
    const world = screenToWorld(view, local.x, local.y);
    return translatedPoses(
      session.origins,
      world.x - session.startWorld.x,
      world.y - session.startWorld.y,
      lift,
    );
  }, [session, settlePoses, pointer, view, lift, viewportRef]);

  function beginGesture(id: string, event: ReactPointerEvent) {
    if (event.button !== 0 || sessionRef.current) return;
    if (!spanForDrag(tokensRef.current, id, selectedIdsRef.current)) return;
    event.stopPropagation();
    event.preventDefault();
    pendingRef.current = {
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
  }

  return {
    dragging: session !== null,
    blockIds: session?.ids ?? [],
    sourceIndex: session?.sourceIndex ?? null,
    activeIndex: session ? session.activeIndex : null,
    primaryId: session?.tokenId ?? null,
    displayTokens,
    floatPoses,
    beginGesture,
  };
}
