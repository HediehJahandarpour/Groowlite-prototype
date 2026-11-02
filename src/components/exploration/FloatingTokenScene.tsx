import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { ScreenRect } from "../../exploration/cameraFocus";
import { IMMERSIVE_DEPTH, projectCandidate } from "../../exploration/depthPose";
import { EXPLORATION } from "../../exploration/explorationConfig";
import {
  EXPLORER_MOTION,
  applyOpeningTeaser,
  depthTransform,
  prefersReducedMotion,
} from "../../exploration/explorerMotion";
import { foregroundFade } from "../../exploration/exclusionZone";
import { createIdleFloat, type IdleFloatController } from "../../exploration/idleFloat";
import type { SpatialCandidate } from "../../exploration/spatialLayout";
import type { CatalogEntry } from "../../process/tokenCatalog";
import { ExplorerTokenCard } from "./ExplorerTokenCard";

type FloatingTokenSceneProps = {
  active: boolean;
  candidates: SpatialCandidate[];
  reachX: number;
  reachY: number;
  tokenSize: number;
  anchorX: number;
  anchorY: number;
  zones: ScreenRect[];
  subscribe: (listener: (progress: number) => void) => () => void;
  onPick: (entry: CatalogEntry) => void;
  onUserScroll: () => void;
  settle: () => void;
  viewport: HTMLElement | null;
};

export type ExplorerMotionHandle = {
  playOpeningTeaser: () => void;
  noteScroll: () => void;
  notePointer: () => void;
};

type HoveredToken = {
  id: string;
  anchor: HTMLButtonElement;
};

export const FloatingTokenScene = forwardRef<
  ExplorerMotionHandle,
  FloatingTokenSceneProps
>(function FloatingTokenScene(
  {
    active,
    candidates,
    reachX,
    reachY,
    tokenSize,
    anchorX,
    anchorY,
    zones,
    subscribe,
    onPick,
    onUserScroll,
    settle,
    viewport,
  },
  ref,
) {
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const hoverId = useRef<string | null>(null);
  const pickLock = useRef(false);
  const [hover, setHover] = useState<HoveredToken | null>(null);
  const idleRef = useRef<IdleFloatController | null>(null);
  const paintRef = useRef<(progress: number) => void>(() => {});
  const progressRef = useRef(0);
  const teaserAmount = useRef(0);
  const teaserProxy = useRef({ amount: 0 });
  const teaserTween = useRef<gsap.core.Tween | null>(null);
  const teaserPlayed = useRef(false);
  const teaserEngaged = useRef(false);
  const teaserCancelling = useRef(false);
  const scrollLatched = useRef(false);
  const resumeTimer = useRef(0);
  const visibleRef = useRef(new Map<string, boolean>());
  const onUserScrollRef = useRef(onUserScroll);
  onUserScrollRef.current = onUserScroll;
  const activeRef = useRef(active);
  activeRef.current = active;

  function paintTeaser() {
    paintRef.current(progressRef.current);
  }

  function cancelTeaser() {
    if (teaserCancelling.current) return;
    const running = teaserTween.current;
    if (!running && teaserProxy.current.amount < 0.001) return;
    teaserCancelling.current = true;
    running?.kill();
    teaserTween.current = null;
    if (teaserProxy.current.amount < 0.001) {
      teaserAmount.current = 0;
      teaserCancelling.current = false;
      paintTeaser();
      return;
    }
    teaserTween.current = gsap.to(teaserProxy.current, {
      amount: 0,
      duration: EXPLORER_MOTION.teaser.cancelDuration,
      ease: "power1.out",
      overwrite: true,
      onUpdate: () => {
        teaserAmount.current = teaserProxy.current.amount;
        paintTeaser();
      },
      onComplete: () => {
        teaserAmount.current = 0;
        teaserProxy.current.amount = 0;
        teaserTween.current = null;
        teaserCancelling.current = false;
        paintTeaser();
      },
    });
  }

  function armResume() {
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      resumeTimer.current = 0;
      scrollLatched.current = false;
      if (!activeRef.current) return;
      idleRef.current?.resume();
    }, EXPLORER_MOTION.idle.resumeDelay * 1000);
  }

  function noteScroll() {
    teaserEngaged.current = true;
    if (!scrollLatched.current) {
      scrollLatched.current = true;
      onUserScrollRef.current();
      cancelTeaser();
    }
    idleRef.current?.suspend();
    armResume();
  }

  useImperativeHandle(
    ref,
    () => ({
      playOpeningTeaser() {
        if (!activeRef.current || teaserPlayed.current) return;
        teaserPlayed.current = true;
        if (
          teaserEngaged.current ||
          !EXPLORER_MOTION.teaser.enabled ||
          prefersReducedMotion()
        ) {
          return;
        }
        teaserCancelling.current = false;
        teaserProxy.current.amount = 0;
        teaserAmount.current = 0;
        teaserTween.current?.kill();
        teaserTween.current = gsap.to(teaserProxy.current, {
          amount: 1,
          duration: EXPLORER_MOTION.teaser.duration / 2,
          ease: "sine.inOut",
          yoyo: true,
          repeat: 1,
          onUpdate: () => {
            teaserAmount.current = teaserProxy.current.amount;
            paintTeaser();
          },
          onComplete: () => {
            teaserAmount.current = 0;
            teaserProxy.current.amount = 0;
            teaserTween.current = null;
            paintTeaser();
          },
        });
      },
      noteScroll,
      notePointer() {
        if (!teaserPlayed.current) return;
        teaserEngaged.current = true;
        cancelTeaser();
      },
    }),
    [],
  );

  useLayoutEffect(() => {
    if (!active) {
      teaserTween.current?.kill();
      teaserTween.current = null;
      teaserAmount.current = 0;
      teaserProxy.current.amount = 0;
      teaserPlayed.current = false;
      teaserEngaged.current = false;
      teaserCancelling.current = false;
      scrollLatched.current = false;
      window.clearTimeout(resumeTimer.current);
      return;
    }

    const reduced = prefersReducedMotion();
    const floaters: {
      id: string;
      rank: number;
      group: number;
      element: HTMLElement;
    }[] = [];
    for (const item of candidates) {
      const element = nodes.current
        .get(item.id)
        ?.querySelector(".float-token__float");
      if (element instanceof HTMLElement) {
        floaters.push({
          id: item.id,
          rank: item.rank,
          group: item.group,
          element,
        });
      }
    }
    const idle = createIdleFloat(floaters, reduced);
    idleRef.current = idle;
    if (scrollLatched.current) idle.suspend();
    const seen = visibleRef.current;
    seen.clear();

    const paint = (progress: number) => {
      progressRef.current = progress;
      const amount = teaserAmount.current;
      for (const item of candidates) {
        const node = nodes.current.get(item.id);
        if (!node) continue;
        const motion = projectCandidate(item, progress, reachX, reachY);
        const posed =
          amount > 0.001
            ? applyOpeningTeaser(item.group, progress, amount, {
                z: motion.z,
                scale: motion.scale,
                opacity: motion.opacity,
              })
            : null;
        const guard = foregroundFade(
          item,
          progress,
          { anchorX, anchorY, reachX, reachY, tokenSize },
          zones,
        );
        const opacity = (posed?.opacity ?? motion.opacity) * guard;
        const interactive = motion.interactive && guard > 0.55;
        node.style.transform = posed
          ? depthTransform({
              x: motion.x,
              y: motion.y,
              z: posed.z,
              rotateX: motion.rotateX,
              rotateY: motion.rotateY,
              scale: posed.scale,
            })
          : motion.transform;
        node.style.zIndex = String(motion.zIndex);
        node.style.setProperty("--fade", opacity.toFixed(3));
        node.dataset.ready = interactive ? "true" : "false";
        node.tabIndex = interactive ? 0 : -1;
        node.classList.toggle("is-near", interactive);
        const was = seen.get(item.id) ?? false;
        const visible = was
          ? opacity > EXPLORER_MOTION.idle.hideBelow
          : opacity > EXPLORER_MOTION.idle.showAbove;
        if (visible !== was) {
          seen.set(item.id, visible);
          idle.setVisible(item.id, visible);
        }
      }
      const current = hoverId.current;
      if (!current) return;
      const node = nodes.current.get(current);
      if (node?.dataset.ready === "true") return;
      const art = node?.querySelector(".float-token__art");
      if (art instanceof HTMLElement) art.style.transform = "";
      hoverId.current = null;
      idle.release(current);
      setHover(null);
    };
    paintRef.current = paint;

    let primed = false;
    let last = 0;
    const unsubscribe = subscribe((progress) => {
      const delta = Math.abs(progress - last);
      last = progress;
      if (primed && delta > 0.0015) noteScroll();
      primed = true;
      paint(progress);
    });

    return () => {
      unsubscribe();
      paintRef.current = () => {};
      idle.destroy();
      if (idleRef.current === idle) idleRef.current = null;
    };
  }, [
    active,
    anchorX,
    anchorY,
    candidates,
    reachX,
    reachY,
    subscribe,
    tokenSize,
    zones,
  ]);

  useLayoutEffect(() => {
    return () => {
      teaserTween.current?.kill();
      window.clearTimeout(resumeTimer.current);
    };
  }, []);

  function showCard(node: HTMLButtonElement, item: SpatialCandidate) {
    if (node.dataset.ready !== "true") return;
    hoverId.current = item.id;
    idleRef.current?.hold(item.id);
    setHover({ id: item.id, anchor: node });
  }

  function hideCard(node: HTMLButtonElement) {
    const id = hoverId.current;
    hoverId.current = null;
    if (id) idleRef.current?.release(id);
    setHover(null);
    const art = node.querySelector(".float-token__art");
    if (art instanceof HTMLElement) art.style.transform = "";
  }

  function tilt(node: HTMLButtonElement, clientX: number, clientY: number) {
    if (node.dataset.ready !== "true") return;
    const art = node.querySelector(".float-token__art");
    if (!(art instanceof HTMLElement)) return;
    const box = node.getBoundingClientRect();
    const px = (clientX - box.left) / box.width - 0.5;
    const py = (clientY - box.top) / box.height - 0.5;
    const leanX = Math.max(-1, Math.min(1, -py)) * 32;
    const leanY = Math.max(-1, Math.min(1, px)) * 42;
    art.style.transform = `translateZ(28px) rotateX(${leanX.toFixed(2)}deg) rotateY(${leanY.toFixed(2)}deg) scale(1.04)`;
  }

  return (
    <div
      className="explorer-scene"
      style={{ perspective: `${IMMERSIVE_DEPTH.perspective}px` }}
    >
      {candidates.map((item) => (
        <button
          key={item.id}
          type="button"
          className="float-token"
          data-group={item.group}
          data-ready="false"
          tabIndex={-1}
          aria-label={item.label}
          ref={(node) => {
            if (node) nodes.current.set(item.id, node);
            else nodes.current.delete(item.id);
          }}
          style={{
            width: tokenSize * item.presence,
          }}
          onMouseEnter={(event) => showCard(event.currentTarget, item)}
          onMouseMove={(event) =>
            tilt(event.currentTarget, event.clientX, event.clientY)
          }
          onMouseLeave={(event) => hideCard(event.currentTarget)}
          onFocus={(event) => showCard(event.currentTarget, item)}
          onBlur={(event) => hideCard(event.currentTarget)}
          onClick={(event) => {
            const node = event.currentTarget;
            if (node.dataset.ready !== "true" || pickLock.current) return;
            pickLock.current = true;
            settle();
            node.classList.add("is-confirmed");
            flyTowardProcess(item.asset, node.getBoundingClientRect());
            const type =
              item.type === "phase" ||
              item.type === "activity" ||
              item.type === "checkpoint"
                ? item.type
                : "activity";
            const category =
              item.category === "phase" ||
              item.category === "activity" ||
              item.category === "checkpoint"
                ? item.category
                : "activity";
            onPick({
              id: item.id,
              asset: item.asset,
              label: item.label,
              type,
              category,
            });
            window.setTimeout(() => {
              node.classList.remove("is-confirmed");
              pickLock.current = false;
            }, 160);
          }}
        >
          <svg className="float-token__stroke" viewBox="0 0 100 100" aria-hidden="true">
            <polygon points="50,1 98,35 80,93 20,93 2,35" fill="none" />
          </svg>
          <span className="float-token__check" aria-hidden="true">
            ✓
          </span>
          <span className="float-token__art">
            <span className="float-token__float">
              <img src={`/tokens/${item.asset}`} alt="" draggable={false} />
            </span>
          </span>
        </button>
      ))}
      {hover && viewport ? (
        <ExplorerTokenCard
          id={hover.id}
          anchor={hover.anchor}
          viewport={viewport}
        />
      ) : null}
    </div>
  );
});

function flyTowardProcess(asset: string, from: DOMRect) {
  const canvas = document.querySelector(".canvas");
  if (!(canvas instanceof HTMLElement)) return;
  const to = canvas.getBoundingClientRect();
  const node = document.createElement("img");
  node.src = `/tokens/${asset}`;
  node.alt = "";
  node.className = "explorer-flyer";
  document.body.appendChild(node);
  gsap.fromTo(
    node,
    {
      left: from.left,
      top: from.top,
      width: Math.min(from.width, 96),
      opacity: 1,
    },
    {
      left: to.left + to.width * EXPLORATION.splitLeftX - 21,
      top: to.top + to.height * EXPLORATION.processFocusY - 21,
      width: 42,
      opacity: 0,
      duration: 0.34,
      ease: "power2.in",
      onComplete: () => node.remove(),
    },
  );
}
