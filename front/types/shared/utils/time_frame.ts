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
