import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import type { CanvasView } from "../canvas/view";
import type { ProcessToken } from "../process/processTypes";
import { explorationView } from "./cameraFocus";
import { EXPLORATION } from "./explorationConfig";
import { buildProcessSplit, type ProcessSplit } from "./processSplit";

type FlyTo = (next: CanvasView, duration: number) => void;

type UseExplorationCameraArgs = {
  active: boolean;
  tokens: ProcessToken[];
  insertionIndex: number;
  replaceId: string | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  getView: () => CanvasView;
  flyTo: FlyTo;
};

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Zooms the existing canvas camera onto the insertion point while a
 * category is open, then returns to the view from before exploration.
 * The glass fades on its own timeline so a later focus nudge does not
 * restart it. Candidate scrolling does not call this.
 */
export function useExplorationCamera({
  active,
  tokens,
  insertionIndex,
  replaceId,
  viewportRef,
  getView,
  flyTo,
}: UseExplorationCameraArgs) {
  const home = useRef<CanvasView | null>(null);
  const applied = useRef("");
  const phase = useRef<"idle" | "open" | "closing">("idle");
  const atmosphereRef = useRef(0);
  const fadeRef = useRef<gsap.core.Tween | null>(null);
  const [atmosphere, setAtmosphere] = useState(0);
  const [split, setSplit] = useState<ProcessSplit | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const fadeAtmosphere = (to: number, duration: number, onDone?: () => void) => {
    fadeRef.current?.kill();
    fadeRef.current = null;
    if (duration <= 0 || reducedMotion()) {
      atmosphereRef.current = to;
      setAtmosphere(to);
      onDone?.();
      return;
    }
    const proxy = { value: atmosphereRef.current };
    fadeRef.current = gsap.to(proxy, {
      value: to,
      duration,
      ease: "power2.inOut",
      onUpdate: () => {
        atmosphereRef.current = proxy.value;
        setAtmosphere(proxy.value);
      },
      onComplete: () => {
        fadeRef.current = null;
        atmosphereRef.current = to;
        setAtmosphere(to);
        onDone?.();
      },
    });
  };

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const read = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewportRef]);

  useEffect(() => {
    if (size.width < 2 || size.height < 2) return;
    const viewport = { width: size.width, height: size.height };

    if (active) {
      const next = explorationView(tokens, insertionIndex, replaceId, viewport);
      const model = buildProcessSplit(
        tokens,
        insertionIndex,
        replaceId,
        next,
        viewport,
      );
      const key = [
        next.x.toFixed(0),
        next.y.toFixed(0),
        next.scale.toFixed(2),
        model.leftIds.join(","),
        model.rightIds.join(","),
        model.zones
          .map((zone) =>
            [zone.left, zone.top, zone.right, zone.bottom]
              .map((value) => value.toFixed(0))
              .join(","),
          )
          .join("|"),
      ].join(":");
      const resuming = phase.current === "closing";
      phase.current = "open";
      if (!home.current) home.current = getView();
      if (applied.current === key && !resuming) return;
      const opening = applied.current === "" || resuming;
      applied.current = key;
      setSplit(model);
      if (opening) fadeAtmosphere(1, EXPLORATION.transitionDuration);
      flyTo(
        next,
        opening ? EXPLORATION.transitionDuration : EXPLORATION.adjustDuration,
      );
      return;
    }

    if (phase.current !== "open") return;
    phase.current = "closing";
    const back = home.current;
    applied.current = "";
    fadeAtmosphere(0, EXPLORATION.transitionDuration, () => {
      if (phase.current === "closing") phase.current = "idle";
      home.current = null;
      setSplit(null);
    });
    if (back) flyTo(back, EXPLORATION.transitionDuration);
  }, [
    active,
    tokens,
    insertionIndex,
    replaceId,
    size.width,
    size.height,
    flyTo,
    getView,
  ]);

  return { atmosphere, split };
}
