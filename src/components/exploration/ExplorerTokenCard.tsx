import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronUp } from "lucide-react";
import { activityInfoFor, bestForLabel } from "../../data/activityInfo";
import { phaseInfoFor } from "../../data/phaseInfo";

const GAP = 8;
const MARGIN = 8;

type ExplorerTokenCardProps = {
  id: string;
  anchor: HTMLElement;
  viewport: HTMLElement;
};

export function ExplorerTokenCard({ id, anchor, viewport }: ExplorerTokenCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let frame = 0;

    function place() {
      const node = cardRef.current;
      if (!node) return;
      const token = anchor.getBoundingClientRect();
      const bounds = viewport.getBoundingClientRect();
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      const maxLeft = bounds.width - width - MARGIN;
      const rightEdge = token.right - bounds.left + GAP;
      const leftEdge = token.left - bounds.left - GAP - width;
      const side = rightEdge <= maxLeft || leftEdge < MARGIN ? "right" : "left";
      const rawLeft = side === "right" ? rightEdge : leftEdge;
      const left = Math.max(MARGIN, Math.min(rawLeft, Math.max(MARGIN, maxLeft)));
      const rawTop = token.top - bounds.top + (token.height - height) / 2;
      const top = Math.max(MARGIN, Math.min(rawTop, bounds.height - height - MARGIN));
      node.style.top = `${top}px`;
      node.style.left = `${left}px`;
      node.dataset.placed = "true";
    }

    place();
    frame = requestAnimationFrame(function follow() {
      place();
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor, viewport]);

  const activity = activityInfoFor(id);
  const phase = phaseInfoFor(id);
  const copy = activity
    ? { bestFor: bestForLabel(activity.bestFor), whenToUse: activity.whenToUse }
    : phase;
  if (!copy) return null;

  return createPortal(
    <div ref={cardRef} className="explorer-token-card" role="tooltip">
      <ul className="explorer-token-card__list">
        <li>
          <strong>Best for:</strong> {copy.bestFor}
        </li>
        <li>
          <strong>When to use?</strong> {copy.whenToUse}
        </li>
      </ul>
      <p className="explorer-token-card__more">
        <ChevronUp size={12} strokeWidth={2.25} aria-hidden />
        Read More
      </p>
    </div>,
    viewport,
  );
}
