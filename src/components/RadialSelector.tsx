import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { layoutRadial, type WorldBounds } from "../process/radialLayout";
import type { CatalogEntry } from "../process/tokenCatalog";
import type { Point } from "../process/processTypes";
import "./RadialSelector.css";

export type RadialChoice = {
  entry: CatalogEntry;
  angle: number;
};

type RadialSelectorProps = {
  open: boolean;
  tokens: RadialChoice[];
  gradientSrc: string;
  categoryLabel: string;
  origin: Point;
  /** The radar plate. While the radar is open this host is raised over the process. */
  gradientHost: HTMLDivElement | null;
  onPick: (entry: CatalogEntry) => void;
  onFit: (bounds: WorldBounds) => void;
};

function stopPointer(event: ReactPointerEvent) {
  event.stopPropagation();
}

/**
 * Temporary circular library. Positions are world pixels inside the canvas
 * camera, so the selector pans and zooms once, with the process.
 */
export function RadialSelector({
  open,
  tokens,
  gradientSrc,
  categoryLabel,
  origin,
  gradientHost,
  onPick,
  onFit,
}: RadialSelectorProps) {
  const [entered, setEntered] = useState(false);
  const layout = layoutRadial(origin, tokens);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setEntered(true);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const { minX, minY, maxX, maxY } = layout.reveal;
  useEffect(() => {
    if (!open) return;
    onFit({ minX, minY, maxX, maxY });
  }, [open, minX, minY, maxX, maxY, onFit]);

  const visible = open && entered;
  const gradient = (
    <img
      className={
        visible
          ? "radial-selector__gradient radial-selector__gradient--open"
          : "radial-selector__gradient"
      }
      src={gradientSrc}
      alt=""
      draggable={false}
      style={{
        left: layout.center.x,
        top: layout.center.y,
        width: layout.gradient,
        height: layout.gradient,
      }}
    />
  );

  return (
    <div
      className={
        visible ? "radial-selector radial-selector--open" : "radial-selector"
      }
      role="group"
      aria-label={`Choose a ${categoryLabel} token`}
      aria-hidden={!open}
      onPointerDown={stopPointer}
    >
      {gradientHost ? createPortal(gradient, gradientHost) : null}
      {layout.tokens.map((token, index) => (
        <button
          key={token.entry.id}
          type="button"
          className="radial-selector__token"
          style={{
            left: token.x,
            top: token.y,
            width: layout.token,
            ["--i" as string]: index,
          }}
          aria-label={token.entry.label}
          tabIndex={open ? 0 : -1}
          disabled={!open}
          onClick={() => onPick(token.entry)}
        >
          <img src={`/tokens/${token.entry.asset}`} alt="" draggable={false} />
        </button>
      ))}
    </div>
  );
}
