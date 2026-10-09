import { rand } from "@app/lib/utils/seeded_random";

// Sparkle's `-500` colors (`sparkle/src/styles/tokens.css`) in six-digit hex, the only format
// y-tiptap's carets accept: they reach other people's editors through awareness.
const CARET_COLORS = [
  "#1c91ff", // blue
  "#ff6900", // orange
  "#54b47d", // emerald
  "#8e51ff", // violet
  "#ec4987", // pink
  "#ffaa0d", // golden
];

/** A stable caret color per user, so others recognize them across sessions. */
export function liveCaretColor(userId: string): string {
  return CARET_COLORS[Math.floor(rand(userId)() * CARET_COLORS.length)];
}
