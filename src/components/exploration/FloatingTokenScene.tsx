import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { CatalogEntry } from "../../process/tokenCatalog";
import { IMMERSIVE_DEPTH, projectCandidate } from "../../exploration/depthPose";
import type { SpatialCandidate } from "../../exploration/spatialLayout";
import { ExplorerTokenCard } from "./ExplorerTokenCard";

type FloatingTokenSceneProps = {
  candidates: SpatialCandidate[];
  reachX: number;
  reachY: number;
  tokenSize: number;
  subscribe: (listener: (progress: number) => void) => () => void;
  onPick: (entry: CatalogEntry) => void;
  onProgress: (progress: number) => void;
  settle: () => void;
  viewport: HTMLElement | null;
};

type HoveredToken = {
  id: string;
  anchor: HTMLButtonElement;
};

export function FloatingTokenScene({
  candidates,
  reachX,
  reachY,
  tokenSize,
  subscribe,
  onPick,
  onProgress,
  settle,
  viewport,
}: FloatingTokenSceneProps) {
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const hoverId = useRef<string | null>(null);
  const pickLock = useRef(false);
  const [hover, setHover] = useState<HoveredToken | null>(null);

  useLayoutEffect(() => {
    return subscribe((progress) => {
      onProgress(progress);
      for (const item of candidates) {
        const node = nodes.current.get(item.id);
        if (!node) continue;
        const motion = projectCandidate(item, progress, reachX, reachY);
        node.style.transform = motion.transform;
        node.style.zIndex = String(motion.zIndex);
        node.style.setProperty("--fade", motion.opacity.toFixed(3));
        node.dataset.ready = motion.interactive ? "true" : "false";
        node.tabIndex = motion.interactive ? 0 : -1;
        node.classList.toggle("is-near", motion.interactive);
      }
      const current = hoverId.current;
      if (!current) return;
      const node = nodes.current.get(current);
      if (node?.dataset.ready === "true") return;
      const art = node?.querySelector(".float-token__art");
      if (art instanceof HTMLElement) art.style.transform = "";
      hoverId.current = null;
      setHover(null);
    });
  }, [candidates, onProgress, reachX, reachY, subscribe]);

  function showCard(node: HTMLButtonElement, item: SpatialCandidate) {
    if (node.dataset.ready !== "true") return;
    hoverId.current = item.id;
    setHover({ id: item.id, anchor: node });
  }

  function hideCard(node: HTMLButtonElement) {
    hoverId.current = null;
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
            ["--delay" as string]: `${-((item.rank * 0.37 + item.group * 0.21) % 4).toFixed(2)}s`,
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
            flyToPreview(item.asset, node.getBoundingClientRect());
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
}

function flyToPreview(asset: string, from: DOMRect) {
  const preview = document.querySelector(".explorer-preview");
  if (!(preview instanceof HTMLElement)) return;
  const to = preview.getBoundingClientRect();
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
      left: to.left + 18,
      top: to.top + 16,
      width: 42,
      opacity: 0,
      duration: 0.34,
      ease: "power2.in",
      onComplete: () => node.remove(),
    },
  );
}
