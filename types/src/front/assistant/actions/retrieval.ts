/**
 * Data Source configuration
 */

import { ioTsEnum } from "../../../shared/utils/iots_utils";

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

export type RetrievalQuery = "auto" | "none";
export type RetrievalTimeframe = "auto" | "none" | TimeFrame;

export function isTimeFrame(arg: RetrievalTimeframe): arg is TimeFrame {
  return (
    (arg as TimeFrame).duration !== undefined &&
    (arg as TimeFrame).unit !== undefined
  );
}

export type DataSourceFilter = {
  tags: { in: string[]; not: string[] } | null;
  parents: { in: string[]; not: string[] } | null;
};

export type DataSourceConfiguration = {
  workspaceId: string;
  dataSourceId: string;
  filter: DataSourceFilter;
};
