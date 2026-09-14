import { timeAgoFrom } from "@app/lib/utils";

// Recommendations created within the last minute read as "Just now".
export const JUST_NOW_THRESHOLD_MS = 60_000;

// Middot separating a recommendation's source label from its relative time
// (e.g. "From your #design channel · 2h ago").
export const SOURCE_META_SEPARATOR = "·";

export function recencyLabel(createdAtMs: number): string {
  if (Date.now() - createdAtMs < JUST_NOW_THRESHOLD_MS) {
    return "Just now";
  }
  return `${timeAgoFrom(createdAtMs, { useLongFormat: true })} ago`;
}
