// Isometric projection helpers for the home-page hero scene. The floor plan
// lives in plan-space (a 2D xy plan with a z axis pointing up); these
// functions map plan coords onto the SVG canvas's screen-space coords.

export const SVG_NS = "http://www.w3.org/2000/svg";

export const ISO_SCALE = 1.05;
export const ISO_ORIGIN_X = 800;
export const ISO_ORIGIN_Y = 210;

const COS30 = 0.8660254;
const SIN30 = 0.5;

/** Project plan-space (px, py, pz=0) onto SVG screen coords [sx, sy]. */
export function iso(px: number, py: number, pz: number = 0): [number, number] {
  const sx = ISO_ORIGIN_X + (px - py) * COS30 * ISO_SCALE;
  const sy = ISO_ORIGIN_Y + (px + py) * SIN30 * ISO_SCALE - pz * ISO_SCALE;
  return [sx, sy];
}
