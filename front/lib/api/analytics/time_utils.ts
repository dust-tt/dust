import { assertNever } from "@app/types/shared/utils/assert_never";

export const HOUR_MS = 3_600_000;
export const FOUR_HOURS_MS = 4 * HOUR_MS;
export const DAY_MS = 24 * HOUR_MS;

export type WindowSize = "HOUR" | "FOUR_HOURS" | "DAY";

function getWindowSizeMs(windowSize: WindowSize): number {
  switch (windowSize) {
    case "HOUR":
      return HOUR_MS;
    case "FOUR_HOURS":
      return FOUR_HOURS_MS;
    case "DAY":
      return DAY_MS;
    default:
      assertNever(windowSize);
  }
}

export function getTimestampsForWindow(
  start: Date,
  end: Date,
  windowSize: WindowSize
): number[] {
  const incrementMs = getWindowSizeMs(windowSize);
  const timestamps: number[] = [];
  const current = new Date(start);
  while (current < end) {
    timestamps.push(current.getTime());
    current.setTime(current.getTime() + incrementMs);
  }
  return timestamps;
}
