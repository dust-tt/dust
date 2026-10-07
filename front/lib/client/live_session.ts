import { rand } from "@app/lib/utils/seeded_random";

/**
 * @cc [owner:PopDaph,label:product] live-session-dev-only
 * The live session URL MUST be null outside development builds, whatever the environment
 * provides: no server runs elsewhere yet, and a live editor does not save the file.
 */
export function getLiveSessionUrl(): string | null {
  if (import.meta.env?.MODE !== "development") {
    return null;
  }
  return import.meta.env.VITE_DUST_COLLAB_URL ?? null;
}

const CARET_COLORS = [
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#a855f7",
  "#ec4899",
  "#eab308",
];

/** A stable caret color per user, so others recognize them across sessions. */
export function liveCaretColor(userId: string): string {
  return CARET_COLORS[Math.floor(rand(userId)() * CARET_COLORS.length)];
}
