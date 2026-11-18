import gsap from "gsap";
import { EXPLORATION } from "./explorationConfig";
import { prefersReducedMotion } from "./explorerMotion";

export type FlyTokenOptions = {
  asset: string;
  /** Screen box of the visible explorer token at the moment of the click. */
  from: DOMRect;
  /**
   * Insert the token into the process. Prefer wrapping with React
   * `flushSync` so split poses update before the flight aims.
   */
  onCommit?: () => void;
  onDone?: () => void;
};

/** Hide the explorer token immediately — do not wait for React. */
export function hideDepartingToken(node: HTMLElement) {
  node.dataset.departed = "true";
  node.dataset.ready = "false";
  node.classList.add("is-departing");
  node.style.visibility = "hidden";
  node.style.opacity = "0";
  node.style.pointerEvents = "none";
  node.setAttribute("aria-hidden", "true");
  node.tabIndex = -1;
}

/**
 * Screen box of the token the user actually sees.
 * Clears nested idle/tilt transforms for one measure so 3D float does not
 * pull the flyer origin away from the painted pentagon.
 */
export function tokenFlightRect(node: HTMLElement): DOMRect {
  const tilt = node.querySelector<HTMLElement>(".float-token__tilt");
  const floater = node.querySelector<HTMLElement>(".float-token__float");
  const saved = {
    tilt: tilt?.style.transform ?? "",
    float: floater?.style.transform ?? "",
    hoverScale: node.style.getPropertyValue("--hover-scale"),
    hoverLift: node.style.getPropertyValue("--hover-lift"),
    tiltX: node.style.getPropertyValue("--tilt-x"),
    tiltY: node.style.getPropertyValue("--tilt-y"),
  };

  if (tilt) tilt.style.transform = "none";
  if (floater) floater.style.transform = "none";
  node.style.setProperty("--hover-scale", "1");
  node.style.setProperty("--hover-lift", "0");
  node.style.setProperty("--tilt-x", "0deg");
  node.style.setProperty("--tilt-y", "0deg");

  const rect = node.getBoundingClientRect();

  if (tilt) tilt.style.transform = saved.tilt;
  if (floater) floater.style.transform = saved.float;
  if (saved.hoverScale) node.style.setProperty("--hover-scale", saved.hoverScale);
  else node.style.removeProperty("--hover-scale");
  if (saved.hoverLift) node.style.setProperty("--hover-lift", saved.hoverLift);
  else node.style.removeProperty("--hover-lift");
  if (saved.tiltX) node.style.setProperty("--tilt-x", saved.tiltX);
  else node.style.removeProperty("--tilt-x");
  if (saved.tiltY) node.style.setProperty("--tilt-y", saved.tiltY);
  else node.style.removeProperty("--tilt-y");

  return rect;
}

/**
 * Push the process clear, glide from the selector to the seat, then swap
 * in place — no land / rotate / stick animation on arrival.
 */
export function flyTokenToProcess({
  asset,
  from,
  onCommit,
  onDone,
}: FlyTokenOptions): () => void {
  const flyer = document.createElement("div");
  flyer.className = "explorer-flyer";
  flyer.setAttribute("aria-hidden", "true");
  const img = document.createElement("img");
  img.src = `/tokens/${asset}`;
  img.alt = "";
  img.draggable = false;
  flyer.appendChild(img);
  document.body.appendChild(flyer);

  const startWidth = Math.max(40, Math.min(from.width || from.height, 160));
  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;

  // Transform-only motion stays on the compositor — less hitch than left/top.
  gsap.set(flyer, {
    left: 0,
    top: 0,
    x: startX,
    y: startY,
    xPercent: -50,
    yPercent: -50,
    width: startWidth,
    opacity: 1,
    scale: 1,
    rotation: 0,
    force3D: true,
  });

  let committed = false;
  let seatNode: HTMLElement | null = null;
  const commit = () => {
    if (committed) return;
    committed = true;
    onCommit?.();
  };

  const revealSeat = () => {
    if (!seatNode) return;
    seatNode.style.opacity = "";
    seatNode.style.visibility = "";
    seatNode.removeAttribute("data-flight-arriving");
  };

  const finish = () => {
    revealSeat();
    flyer.remove();
    onDone?.();
  };

  if (prefersReducedMotion()) {
    commit();
    finish();
    return () => {};
  }

  const beforeIds = new Set(
    processTokenNodes().map((node) => node.getAttribute("data-token-id")),
  );

  commit();
  void document.body.offsetWidth;

  const seat = findNewProcessSeat(beforeIds, asset);
  seatNode = seat?.node ?? null;
  if (seatNode) {
    seatNode.dataset.flightArriving = "true";
    seatNode.style.visibility = "hidden";
    seatNode.style.opacity = "0";
  }

  const target = seat ?? resolveFallbackSeat();

  // Glide only — keep selector size/orientation, then swap straight into the
  // seat with no land/rotate/stick tween.
  const travel = gsap.to(flyer, {
    x: target.x,
    y: target.y,
    duration: 0.7,
    ease: "sine.inOut",
    force3D: true,
    onComplete: finish,
  });

  return () => {
    travel.kill();
    commit();
    finish();
  };
}

function processTokenNodes(): HTMLElement[] {
  return [
    ...document.querySelectorAll(
      ".process-layer .process-token:not(.process-token--floating)",
    ),
  ].filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function tokenCentre(node: HTMLElement) {
  const art = node.querySelector<HTMLElement>("img") ?? node;
  const box = art.getBoundingClientRect();
  return {
    node,
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    size: Math.max(40, Math.min(Math.max(box.width, box.height), 220)),
  };
}

function tokenShowsAsset(node: HTMLElement, asset: string) {
  const images = node.querySelectorAll("img");
  for (const image of images) {
    if (
      image instanceof HTMLImageElement &&
      (image.getAttribute("src")?.includes(asset) ||
        image.currentSrc.includes(asset))
    ) {
      return true;
    }
  }
  return false;
}

function findNewProcessSeat(
  beforeIds: Set<string | null>,
  asset: string,
): { node: HTMLElement; x: number; y: number; size: number } | null {
  const nodes = processTokenNodes();

  const created = nodes.find((node) => {
    const id = node.getAttribute("data-token-id");
    return id != null && !beforeIds.has(id);
  });
  if (created) return tokenCentre(created);

  const start = nodes.find(
    (node) => node.getAttribute("data-token-type") === "start",
  );
  if (start && tokenShowsAsset(start, asset)) return tokenCentre(start);

  const matched = nodes.find((node) => tokenShowsAsset(node, asset));
  if (matched) return tokenCentre(matched);

  const canvas = document.querySelector(".canvas");
  if (!(canvas instanceof HTMLElement)) return null;
  const canvasBox = canvas.getBoundingClientRect();
  const left = nodes.filter((node) => {
    const box = node.getBoundingClientRect();
    return box.left + box.width / 2 < canvasBox.left + canvasBox.width * 0.55;
  });
  const last = left.at(-1);
  return last ? tokenCentre(last) : null;
}

function resolveFallbackSeat(): { x: number; y: number; size: number } {
  const canvas = document.querySelector(".canvas");
  if (!(canvas instanceof HTMLElement)) {
    return { x: window.innerWidth * 0.2, y: window.innerHeight * 0.5, size: 48 };
  }
  const canvasBox = canvas.getBoundingClientRect();
  return {
    x: canvasBox.left + canvasBox.width * EXPLORATION.splitLeftX,
    y: canvasBox.top + canvasBox.height * EXPLORATION.processFocusY,
    size: 48,
  };
}
