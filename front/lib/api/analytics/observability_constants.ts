export const OBSERVABILITY_TIME_RANGE = [7, 14, 30, 90] as const;
export type ObservabilityTimeRangeType =
  (typeof OBSERVABILITY_TIME_RANGE)[number];

export const DEFAULT_PERIOD_DAYS = 30;

export const CONVERSATION_FILES_AGGREGATE_KEY = "__conversation_files__";
