import { rand } from "@app/lib/utils/seeded_random";

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
