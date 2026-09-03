/**
 * Semantic motion tokens for JavaScript animation libraries such as Framer
 * Motion. Durations are expressed in seconds.
 *
 * Keep these values aligned with the CSS tokens in `../styles/theme.css`.
 */
export const MOTION_DURATIONS = {
  enter: 0.2,
  exit: 0.16,
  quickEnter: 0.14,
  quickExit: 0.1,
  modalEnter: 0.3,
  modalExit: 0.24,
} as const;

export const MOTION_EASINGS = {
  enter: [0.215, 0.61, 0.355, 1],
  emphasized: [0.23, 1, 0.32, 1],
  move: [0.455, 0.03, 0.515, 0.955],
} as const;
