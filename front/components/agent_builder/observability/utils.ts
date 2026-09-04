import type { AnalyticsVisibleOrigin } from "@app/components/agent_builder/observability/constants";
import {
  buildColorClass,
  INDEXED_BASE_COLORS,
  INDEXED_SHADES,
  OTHER_LABEL,
  UNKNOWN_LABEL,
  USER_MESSAGE_ORIGIN_LABELS,
} from "@app/components/agent_builder/observability/constants";
import type { ObservabilityMode } from "@app/components/agent_builder/observability/ObservabilityContext";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import { formatShortDate } from "@app/lib/utils/timestamps";
import moment from "moment-timezone";

type VersionMarker = { version: string; timestamp: number };

export function isUserMessageOrigin(
  origin?: string | null
): origin is AnalyticsVisibleOrigin {
  return !!origin && origin in USER_MESSAGE_ORIGIN_LABELS;
}

export function getSourceColor(source: AnalyticsVisibleOrigin) {
  return USER_MESSAGE_ORIGIN_LABELS[source].color;
}

/**
 * Returns a unique color from TOOL_COLORS based on the label's index in allLabels,
 * cycling through the array in a rolling ribbon fashion to ensure distinct but repeating colors.
 * Useful for consistently coloring a set of values.
 * "Other" and "Unknown" are special cases that have their own colors.
 */
export function getIndexedColor(label: string, allLabels: string[]): string {
  if (label === OTHER_LABEL.label) {
    return OTHER_LABEL.color;
  } else if (label === UNKNOWN_LABEL.label) {
    return UNKNOWN_LABEL.color;
  }

  const idx = allLabels.indexOf(label);
  const i = idx >= 0 ? idx : 0;
  const baseColor = INDEXED_BASE_COLORS[i % INDEXED_BASE_COLORS.length];
  const shade =
    INDEXED_SHADES[
      Math.floor(i / INDEXED_BASE_COLORS.length) % INDEXED_SHADES.length
    ];
  return buildColorClass(baseColor, shade);
}

export function getIndexedBaseColor(
  label: string,
  allLabels: string[]
): string {
  const idx = allLabels.indexOf(label);
  return INDEXED_BASE_COLORS[(idx >= 0 ? idx : 0) % INDEXED_BASE_COLORS.length];
}

function truncateToMidnightUTC(timestamp: number): number {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

// Filters a generic time-series of points with a `timestamp` number to the
// selected version window determined by version markers. If no selection or
// markers are provided, returns the original points.
export function filterTimeSeriesByVersionWindow<
  T extends { timestamp: number },
>(
  points: T[] | undefined,
  mode: ObservabilityMode,
  selectedVersion: AgentVersionMarker | null,
  versionMarkers?: VersionMarker[] | null
): T[] {
  const pts = points ?? [];
  if (!pts.length) {
    return pts;
  }

  if (mode !== "version" || !selectedVersion || !versionMarkers?.length) {
    return pts;
  }

  const idx = versionMarkers.findIndex(
    (m) => m.version === selectedVersion.version
  );
  if (idx < 0) {
    return pts;
  }

  // The timestamp of version markers is createdAt, meaning that it's precise time like `1760256757215` Sun Oct 12 2025 10:12:37,
  // so when we compare with point time (which usually comes at midnight time like `1761782400000` since we aggregate the data of the day), we could drop some data
  // if we don't truncate to midnight UTC.
  const start = truncateToMidnightUTC(versionMarkers[idx].timestamp);
  const end =
    idx + 1 < versionMarkers.length
      ? truncateToMidnightUTC(versionMarkers[idx + 1].timestamp)
      : undefined;

  return pts.filter((p) => {
    const pointTime = truncateToMidnightUTC(p.timestamp);
    return pointTime >= start && (end === undefined || pointTime < end);
  });
}

// Generates an array of midnight timestamps for each day in the range,
// stepping via moment to respect DST transitions.
export function getDayTimestamps(
  periodDays: number,
  timezone: string
): number[] {
  const startOfTomorrow = moment.tz(timezone).add(1, "day").startOf("day");
  const cursor = startOfTomorrow.clone().subtract(periodDays, "days");
  const timestamps: number[] = [];
  while (cursor.isBefore(startOfTomorrow)) {
    timestamps.push(cursor.valueOf());
    cursor.add(1, "day");
  }
  return timestamps;
}

// Pads a time-series with zero-value points at the selected time-range bounds
// so the X axis spans the full range even when there's no data.
export function padSeriesToTimeRange<T extends { timestamp: number }>(
  points: T[] | undefined,
  mode: ObservabilityMode,
  periodDays: number,
  zeroFactory: (timestamp: number) => T,
  timezone?: string
) {
  const tz = timezone ?? "UTC";
  const pts = points ?? [];
  if (mode !== "timeRange") {
    return pts.map((pt) => ({
      ...pt,
      date: formatShortDate(pt.timestamp),
    }));
  }

  const byTimestamp = new Map<number, T>(pts.map((p) => [p.timestamp, p]));
  const dayTimestamps = getDayTimestamps(periodDays, tz);

  return dayTimestamps.map((timestamp) => {
    const point = byTimestamp.get(timestamp) ?? zeroFactory(timestamp);
    return {
      ...point,
      date: formatShortDate(point.timestamp),
    };
  });
}
