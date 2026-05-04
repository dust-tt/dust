// Spatial config for the home-page hero office: room geometry (door,
// interior rects, door-light id), where teammates sit inside each room, and
// the corridor rail used by walking agents. All coordinates are in
// plan-space (top-down xy) — heroOfficeIso.ts maps them to screen-space.

export type RoomKey = "office-d" | "office-c" | "office-bl" | "office-t";

export interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomConfig {
  /** Door position in plan-space — used as the entry/exit waypoint. */
  door: { x: number; y: number };
  /** One or more axis-aligned rects defining the seatable interior. The
   *  first rect is also where idle agents stand. */
  interior: RoomRect[];
  /** SVG id of the matching door-light circle in the static markup. */
  lightId: string;
}

export const ROOMS: Record<RoomKey, RoomConfig> = {
  "office-d": {
    door: { x: 180, y: 360 },
    interior: [{ x: 20, y: 20, w: 320, h: 320 }],
    lightId: "light-office-d",
  },
  "office-c": {
    door: { x: 540, y: 360 },
    interior: [{ x: 380, y: 20, w: 320, h: 320 }],
    lightId: "light-office-c",
  },
  "office-bl": {
    door: { x: 120, y: 540 },
    interior: [{ x: 20, y: 560, w: 240, h: 140 }],
    lightId: "light-office-bl",
  },
  "office-t": {
    door: { x: 400, y: 360 },
    interior: [
      { x: 120, y: 380, w: 580, h: 150 },
      { x: 380, y: 530, w: 180, h: 190 },
    ],
    lightId: "light-office-t",
  },
};

/** Seat positions per room (plan-space). The engine builds one human per
 *  point, in this exact order — adding/removing entries changes the office
 *  population without touching the engine.
 *
 *  Each point projects (via heroOfficeIso `iso(px, py, 22)`) to a screen
 *  position that sits at least ~35px inside the corresponding colored room
 *  polygon — leaves ≥10px of room color visible past the human's r=23 disc. */
export const ROOM_POPULATIONS: Record<RoomKey, [number, number][]> = {
  "office-d": [
    [60, 50],
    [50, 180],
    [140, 70],
    [110, 220],
    [210, 110],
    [230, 180],
  ],
  "office-c": [
    [420, 80],
    [570, 80],
    [500, 170],
    [580, 150],
    [510, 240],
  ],
  "office-bl": [
    [60, 580],
    [100, 620],
    [150, 570],
    [170, 600],
  ],
  "office-t": [
    [160, 400],
    [310, 400],
    [460, 400],
    [580, 410],
    [400, 540],
    [420, 620],
    [440, 510],
  ],
};

/** Y-coord of the horizontal corridor rail agents follow when walking
 *  between rooms. Waypoints jitter ~6–8px around this line. */
export const RAIL_Y = 780;
