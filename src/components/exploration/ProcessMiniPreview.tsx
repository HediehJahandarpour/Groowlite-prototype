import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { layoutProcess } from "../../process/processLayout";
import { geometryFor } from "../../process/tokenGeometry";
import type { ProcessToken } from "../../process/processTypes";
import type { ContextFocus } from "../../exploration/contextToken";
import { fitBounds, placedArtBounds, unionBounds } from "../../exploration/previewFit";
import { ProcessTokenView } from "../ProcessToken";

const FALLBACK_FRAME = { width: 216, height: 121 };

type ProcessMiniPreviewProps = {
  tokens: ProcessToken[];
  focus: ContextFocus | null;
};

export function ProcessMiniPreview({ tokens, focus }: ProcessMiniPreviewProps) {
  const fitRef = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState(FALLBACK_FRAME);
  const layout = useMemo(() => layoutProcess(tokens), [tokens]);
  const seated = useMemo(() => seatedToken(tokens), [tokens]);
  const fit = useMemo(() => {
    const bounds = unionBounds(layout.placed.map((item) => placedArtBounds(item)));
    if (!bounds) return { scale: 1, x: 0, y: 0 };
    return fitBounds(bounds, frame, 4);
  }, [layout.placed, frame]);

  useLayoutEffect(() => {
    const node = fitRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width < 1 || height < 1) return;
      setFrame((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const markId = focus
    ? layout.placed.some((item) => item.token.id === focus.id)
      ? focus.id
      : layout.placed.find((item) => item.token.type === "start")?.token.id
    : null;

  return (
    <div className="explorer-preview" aria-label="Process preview">
      <span ref={fitRef} className="explorer-preview__fit" aria-hidden="true">
        <span
          className="explorer-preview__stage"
          style={{
            transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`,
          }}
        >
          {layout.placed.map((item) => (
            <ProcessTokenView
              key={item.token.id}
              placed={item}
              marked={item.token.id === markId}
              hidePentagon={item.token.type === "start"}
              pentagonImage={
                item.token.type === "start" && seated
                  ? `/tokens/${seated.asset}`
                  : undefined
              }
              pentagonArt={
                item.token.type === "start" && seated ? phaseArt(seated) : undefined
              }
              seatedTurn={item.token.type === "start" ? (seated?.turn ?? 0) : 0}
            />
          ))}
        </span>
      </span>
    </div>
  );
}

function seatedToken(tokens: ProcessToken[]): ProcessToken | null {
  const first = tokens
    .filter((token) => token.type === "phase" || token.type === "activity")
    .sort((left, right) => left.order - right.order)[0];
  if (!first || !geometryFor(first).outline) return null;
  return first;
}

function phaseArt(token: ProcessToken) {
  const geometry = geometryFor(token);
  return {
    width: geometry.width,
    height: geometry.height,
    body: geometry.outline ?? [],
    cover: 1.06,
  };
}
