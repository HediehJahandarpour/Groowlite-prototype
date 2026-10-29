import { useId } from "react";
import { GRADIENT_VIEW, PLATE_CIRCLES } from "../process/activityGradient";
import type { Rgb } from "../process/activityMotion";
import type { Point } from "../process/processTypes";

/**
 * Activity plate from Figma node 211:31598.
 * Eight rings plus the centre disc. Each ring is a top-to-bottom blue gradient.
 * There is no blur: the softness is the frame at 50% opacity with linear burn
 * (CSS plus-darker), painted largest to smallest.
 */
const PIVOT = GRADIENT_VIEW / 2;

type RingPaint = {
  stops: string[];
  /** White edge, used on ring 7 and the centre disc. */
  stroke?: number;
};

export const PLATE_RING_STOPS = ["0", "0.15", "0.3", "0.5", "0.7", "0.85", "1"];
const STOPS = PLATE_RING_STOPS;

/**
 * Original blue plate. The first stop of the centre ring is the reference:
 * it becomes the phase colour, and every lighter stop fades toward white
 * by the same amount it did in this blue.
 */
export const PLATE_RINGS: RingPaint[] = [
  {
    stops: [
      "#367AC3",
      "#3D81C9",
      "#5292CF",
      "#6DA5D6",
      "#87B7DE",
      "#92BEE1",
      "#98C3E3",
    ],
    stroke: 0.1,
  },
  {
    stops: [
      "#387EC4",
      "#4685CB",
      "#5792D0",
      "#6FA5D5",
      "#86B6DC",
      "#94BFE1",
      "#9CC5E3",
    ],
  },
  {
    stops: [
      "#3C7FC5",
      "#4989CB",
      "#5995D1",
      "#71A7D6",
      "#88B8DE",
      "#97C2E2",
      "#9EC7E5",
    ],
    stroke: 0.19,
  },
  {
    stops: [
      "#4585C9",
      "#528DCF",
      "#609AD2",
      "#78ABDA",
      "#8EBCE0",
      "#99C5E2",
      "#A2CAE4",
    ],
  },
  {
    stops: [
      "#5994D0",
      "#669AD4",
      "#72A4D7",
      "#83B2DC",
      "#92BEE1",
      "#9DC6E4",
      "#A5CDE6",
    ],
  },
  {
    stops: [
      "#7BAAD8",
      "#82AEDB",
      "#8AB6DD",
      "#98BFE1",
      "#A4C7E3",
      "#ABCDE7",
      "#B2D2E9",
    ],
  },
  {
    stops: [
      "#A9C8E5",
      "#ACCBE7",
      "#B0CEEA",
      "#B6D2EA",
      "#BAD4EB",
      "#BCD7EC",
      "#BED9EC",
    ],
  },
  {
    stops: [
      "#DBE9F4",
      "#DAE8F5",
      "#D7E7F5",
      "#D5E5F4",
      "#D2E2F2",
      "#D0DFF2",
      "#CDDFF1",
    ],
  },
  {
    stops: [
      "#EAF1F9",
      "#EBF2FA",
      "#EDF4FA",
      "#F0F5FB",
      "#F2F7FD",
      "#F3F8FC",
      "#F4F9FD",
    ],
  },
];

const REFERENCE = [0x36, 0x7a, 0xc3];

function fadeOf(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const amount =
    channels.reduce((sum, channel, index) => {
      return sum + (channel - REFERENCE[index]) / (255 - REFERENCE[index]);
    }, 0) / 3;
  return Math.min(1, Math.max(0, amount));
}

const BLUE = PLATE_RINGS;
const FADE = BLUE.map((ring) => ring.stops.map(fadeOf));

export function tintedRingStops(color: Rgb): string[][] {
  return FADE.map((ring) => ring.map((fade) => tint(fade, color)));
}

function tint(fade: number, color: Rgb): string {
  const mixed = [color.r, color.g, color.b].map((channel) =>
    Math.round(channel + (255 - channel) * fade),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Inner band, then middle, then outer. Indexes into PLATE_CIRCLES. */
const BANDS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
];

type RadialGradientLayersProps = {
  center: Point;
  size: number;
  color: Rgb;
  open: boolean;
  /** 0 at a settled layer, 1 halfway to the next. Drives the ring morph. */
  pulse: number;
};

export function RadialGradientLayers({
  center,
  size,
  color,
  open,
  pulse,
}: RadialGradientLayersProps) {
  const raw = useId().replace(/:/g, "");
  const bandStyle = [
    { scale: 1 - 0.05 * pulse, opacity: 1 },
    { scale: 1 - 0.03 * pulse, opacity: 1 },
    { scale: 1 - 0.015 * pulse, opacity: 1 },
  ];
  return (
    <svg
      className={
        open
          ? "radial-activity__gradient radial-activity__gradient--open"
          : "radial-activity__gradient"
      }
      viewBox={`0 0 ${GRADIENT_VIEW} ${GRADIENT_VIEW}`}
      width={size}
      height={size}
      aria-hidden="true"
      style={{ left: center.x, top: center.y }}
    >
      <defs>
        {PLATE_CIRCLES.map((circle, index) => {
          const id = `${raw}-${index}`;
          return (
            <linearGradient
              key={id}
              id={id}
              x1={circle.cx}
              y1={circle.cy - circle.r}
              x2={circle.cx}
              y2={circle.cy + circle.r}
              gradientUnits="userSpaceOnUse"
            >
              {FADE[index].map((fade, stop) => (
                <stop
                  key={stop}
                  offset={STOPS[stop]}
                  stopColor={tint(fade, color)}
                />
              ))}
            </linearGradient>
          );
        })}
      </defs>
      <g>
        <g opacity={0.5}>
          {[...BANDS].reverse().map((band) => {
            const bandIndex = BANDS.indexOf(band);
            const motion = bandStyle[bandIndex];
            return (
              <g
                key={bandIndex}
                style={{
                  transformOrigin: `${PIVOT}px ${PIVOT}px`,
                  transform: `scale(${motion.scale})`,
                  opacity: motion.opacity,
                }}
              >
                {[...band].reverse().map((circleIndex) => {
                  const circle = PLATE_CIRCLES[circleIndex];
                  const paint = BLUE[circleIndex];
                  return (
                    <circle
                      key={circleIndex}
                      cx={circle.cx}
                      cy={circle.cy}
                      r={circle.r}
                      fill={`url(#${raw}-${circleIndex})`}
                      stroke={paint.stroke ? "#fff" : undefined}
                      strokeOpacity={paint.stroke}
                      strokeWidth={paint.stroke ? 0.75 : undefined}
                    />
                  );
                })}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
