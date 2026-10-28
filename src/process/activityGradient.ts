/**
 * Geometry of the activity plate, in the same units as the Figma frame
 * (node 211:31598). Closest circle first.
 */
export const GRADIENT_VIEW = 691.905;

export type PlateCircle = {
  cx: number;
  cy: number;
  r: number;
};

function plate(x: number, y: number, width: number): PlateCircle {
  const r = width / 2;
  return { cx: x + r, cy: y + r, r };
}

export const PLATE_CIRCLES: PlateCircle[] = [
  plate(11.8432, 283.7599, 264.663),
  plate(10.7949, 258.6482, 302.472),
  plate(9.6421, 231.0257, 344.062),
  plate(8.2797, 198.3807, 393.214),
  plate(7.1269, 170.758, 434.804),
  plate(5.8692, 140.6243, 480.174),
  plate(4.1925, 100.4458, 540.669),
  plate(2.0963, 50.2229, 616.287),
  plate(0, 0, 691.905),
];

/**
 * Strokes the tokens sit on, closest first.
 * Later strokes skip rings so a token on one half circle does not cover the next.
 */
export const TOKEN_CIRCLES: PlateCircle[] = [0, 2, 6, 8].map(
  (index) => PLATE_CIRCLES[index],
);
