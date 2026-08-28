import { assertNever } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS, ONE_HOUR_MS } from "@app/types/shared/utils/date_utils";

export { ONE_DAY_MS, ONE_HOUR_MS };

const FOUR_HOURS_MS = 4 * ONE_HOUR_MS;

export type WindowSize = "HOUR" | "FOUR_HOURS" | "DAY";

function getWindowSizeMs(windowSize: WindowSize): number {
  switch (windowSize) {
    case "HOUR":
      return ONE_HOUR_MS;
    case "FOUR_HOURS":
      return FOUR_HOURS_MS;
    case "DAY":
      return ONE_DAY_MS;
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
