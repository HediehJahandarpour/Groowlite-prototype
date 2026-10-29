import { useId, type RefObject } from "react";
import { PLATE_RING_STOPS, tintedRingStops } from "../RadialGradientLayers";
import { GRADIENT_VIEW, PLATE_CIRCLES } from "../../process/activityGradient";
import { PLATE_GROWTH } from "../../exploration/plateGrowth";
import type { Rgb } from "../../process/activityMotion";

const PIVOT = GRADIENT_VIEW / 2;
const OUTER = PLATE_CIRCLES.length - 1;

function ringTransform(scale: number) {
  return `translate(${PIVOT} ${PIVOT}) scale(${scale}) translate(${-PIVOT} ${-PIVOT})`;
}

/**
 * The activity rings, drawn on one shared centre behind the context token.
 * Stops are the Figma plate, shifted onto the active phase colour.
 * Pale stops are pulled back toward that colour so the rings fade less.
 */
function hold(hex: string, color: Rgb): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const mix = 0.28;
  const mixed = channels.map((channel, index) => {
    const base = [color.r, color.g, color.b][index];
    return Math.round(channel + (base - channel) * mix);
  });
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function ExplorerDepthPlate({
  color,
  coreRef,
  outerRef,
}: {
  color: Rgb;
  coreRef: RefObject<SVGGElement | null>;
  outerRef: RefObject<SVGGElement | null>;
}) {
  const raw = useId().replace(/:/g, "");
  const rings = tintedRingStops(color).map((ring) =>
    ring.map((stop) => hold(stop, color)),
  );
  return (
    <svg
      className="explorer-plate"
      viewBox={`0 0 ${GRADIENT_VIEW} ${GRADIENT_VIEW}`}
      aria-hidden="true"
    >
      <defs>
        {PLATE_CIRCLES.map((circle, index) => (
          <linearGradient
            key={index}
            id={`${raw}-${index}`}
            x1={GRADIENT_VIEW / 2}
            y1={GRADIENT_VIEW / 2 - circle.r}
            x2={GRADIENT_VIEW / 2}
            y2={GRADIENT_VIEW / 2 + circle.r}
            gradientUnits="userSpaceOnUse"
          >
            {rings[index].map((stopColor, stop) => (
              <stop
                key={stop}
                offset={PLATE_RING_STOPS[stop]}
                stopColor={stopColor}
              />
            ))}
          </linearGradient>
        ))}
      </defs>
      <g ref={outerRef} transform={ringTransform(PLATE_GROWTH.start)}>
        <circle
          cx={GRADIENT_VIEW / 2}
          cy={GRADIENT_VIEW / 2}
          r={PLATE_CIRCLES[OUTER].r}
          fill={`url(#${raw}-${OUTER})`}
          stroke="#fff"
          strokeOpacity={0.55}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <g ref={coreRef} transform={ringTransform(PLATE_GROWTH.start)}>
        {PLATE_CIRCLES.slice(0, OUTER)
          .map((_, index) => OUTER - 1 - index)
          .map((index) => (
            <circle
              key={index}
              cx={GRADIENT_VIEW / 2}
              cy={GRADIENT_VIEW / 2}
              r={PLATE_CIRCLES[index].r}
              fill={`url(#${raw}-${index})`}
              stroke="#fff"
              strokeOpacity={0.55}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </g>
    </svg>
  );
}
