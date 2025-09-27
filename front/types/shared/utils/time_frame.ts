import { ioTsEnum } from "./iots_utils";

export const TIME_FRAME_UNITS = [
  "hour",
  "day",
  "week",
  "month",
  "year",
] as const;
export type TimeframeUnit = (typeof TIME_FRAME_UNITS)[number];
export const TimeframeUnitCodec = ioTsEnum<TimeframeUnit>(TIME_FRAME_UNITS);

export type TimeFrame = {
  duration: number;
  unit: TimeframeUnit;
};
export function isTimeFrame(arg: any): arg is TimeFrame {
  return (
    typeof arg === "object" &&
    arg !== null &&
    "duration" in arg &&
    "unit" in arg &&
    arg.duration !== undefined &&
    arg.unit !== undefined
  );
}

export const ANY_TIME_FRAME: TimeFrame = {
  duration: -1,
  unit: "year",
};

/**
 * TimeFrame parsing
 */

// Attempts to parse a string representation of the time frame of the form `{k}{unit}` or `all`
// where {k} is a number and {unit} is one of `d`, `w`, `m`, `y` for day, week, month, year.
export function parseTimeFrame(raw: string): TimeFrame | null {
  const r = raw.trim().toLowerCase();
  if (r === "all") {
    return null;
  }

  const m = r.match(/^(\d+)([hdwmy])$/);
  if (!m) {
    return null;
  }

  const duration = parseInt(m[1], 10);
  if (isNaN(duration)) {
    return null;
  }

  let unit: TimeFrame["unit"];
  switch (m[2]) {
    case "h":
      unit = "hour";
      break;
    case "d":
      unit = "day";
      break;
    case "w":
      unit = "week";
      break;
    case "m":
      unit = "month";
      break;
    case "y":
      unit = "year";
      break;
    default:
      return null;
  }

  return {
    duration,
    unit,
  };
}
// Turns a TimeFrame into a number of milliseconds from now.
export function timeFrameFromNow(timeFrame: TimeFrame): number | null {
  const now = Date.now();

  if (timeFrame === ANY_TIME_FRAME) {
    return null;
  }

  switch (timeFrame.unit) {
    case "hour":
      return now - timeFrame.duration * 60 * 60 * 1000;
    case "day":
      return now - timeFrame.duration * 24 * 60 * 60 * 1000;
    case "week":
      return now - timeFrame.duration * 7 * 24 * 60 * 60 * 1000;
    case "month":
      return now - timeFrame.duration * 30 * 24 * 60 * 60 * 1000;
    case "year":
      return now - timeFrame.duration * 365 * 24 * 60 * 60 * 1000;
    default:
      ((x: never) => {
        throw new Error(`Unexpected time frame unit ${x}`);
      })(timeFrame.unit);
  }
}
