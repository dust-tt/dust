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
 *  population without touching the engine. */
export const ROOM_POPULATIONS: Record<RoomKey, [number, number][]> = {
  "office-d": [
    [50, 40],
    [50, 200],
    [140, 60],
    [140, 280],
    [220, 120],
    [280, 180],
  ],
  "office-c": [
    [420, 60],
    [580, 60],
    [500, 170],
    [640, 160],
    [580, 280],
  ],
  "office-bl": [
    [40, 590],
    [110, 680],
    [180, 590],
    [240, 620],
  ],
  "office-t": [
    [150, 400],
    [310, 400],
    [470, 400],
    [630, 400],
    [400, 560],
    [470, 680],
    [440, 520],
  ],
};

/** Y-coord of the horizontal corridor rail agents follow when walking
 *  between rooms. Waypoints jitter ~6–8px around this line. */
export const RAIL_Y = 780;
