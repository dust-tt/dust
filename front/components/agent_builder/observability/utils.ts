import {
  INDEXED_COLORS,
  OTHER_LABEL,
  UNKNOWN_LABEL,
  USER_MESSAGE_ORIGIN_LABELS,
} from "@app/components/agent_builder/observability/constants";
import type { ObservabilityMode } from "@app/components/agent_builder/observability/ObservabilityContext";
import type { SourceChartDatum } from "@app/components/agent_builder/observability/types";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import { formatShortDate } from "@app/lib/utils/timestamps";
import type { UserMessageOrigin } from "@app/types";

export type VersionMarker = { version: string; timestamp: number };

export type ValuesPayload = { values: Record<string, number> };

export type SourceBucket = { origin: string; count: number };

export function isUserMessageOrigin(
  origin?: string | null
): origin is UserMessageOrigin {
  return !!origin && origin in USER_MESSAGE_ORIGIN_LABELS;
}

export function getSourceColor(source: UserMessageOrigin) {
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
  return INDEXED_COLORS[(idx >= 0 ? idx : 0) % INDEXED_COLORS.length];
}

export function buildSourceChartData(
  buckets: SourceBucket[],
  total: number
): SourceChartDatum[] {
  const aggregatedByOrigin = buckets.reduce((acc, b) => {
    if (!isUserMessageOrigin(b.origin)) {
      return acc;
    }

    const origin: UserMessageOrigin = b.origin;
    const current = acc.get(origin) ?? 0;
    acc.set(origin, current + b.count);
    return acc;
  }, new Map<UserMessageOrigin, number>());

  return Array.from(aggregatedByOrigin.entries()).map(([origin, count]) => ({
    origin,
    label: USER_MESSAGE_ORIGIN_LABELS[origin].label,
    count,
    percent: total > 0 ? Math.round((count / total) * 100) : 0,
  }));
}

// Returns the top N tools from a pre-aggregated count map
export function selectTopTools(
  toolCounts: Map<string, number>,
  maxTools: number
): string[] {
  return Array.from(toolCounts.entries())
    .sort((a, b) => {
      const countDiff = b[1] - a[1];
      return countDiff !== 0 ? countDiff : a[0].localeCompare(b[0]);
    })
    .slice(0, maxTools)
    .map(([toolName]) => toolName);
}

// Finds the version marker that is active for the given date.
// Returns the marker whose timestamp is <= date and whose next marker's timestamp > date.
// If date is before all markers, returns null.
// If date is after all markers, returns the last marker.
export function findVersionMarkerForDate(
  date: string | Date,
  versionMarkers: VersionMarker[]
): VersionMarker | null {
  if (!versionMarkers.length) {
    return null;
  }

  const targetTime = new Date(date).getTime();

  // Binary search could be used here for better performance with many markers,
  // but linear search is simple and sufficient for typical use cases
  for (let i = versionMarkers.length - 1; i >= 0; i--) {
    const markerTime = new Date(versionMarkers[i].timestamp).getTime();
    if (targetTime >= markerTime) {
      return versionMarkers[i];
    }
  }

  // Date is before all markers
  return null;
}

const truncateToMidnightUTC = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
};

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

export function formatUTCDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTimeRangeBounds(periodDays: number): [string, string] {
  const endUTC = Date.now();
  const startUTC = endUTC - periodDays * 24 * 60 * 60 * 1000;
  return [
    formatUTCDateString(new Date(startUTC)),
    formatUTCDateString(new Date(endUTC)),
  ];
}

// Pads a time-series with zero-value points at the selected time-range bounds
// so the X axis spans the full range even when there's no data.
export function padSeriesToTimeRange<T extends { timestamp: number }>(
  points: T[] | undefined,
  mode: ObservabilityMode,
  periodDays: number,
  zeroFactory: (timestamp: number) => T
) {
  const pts = points ?? [];
  if (mode !== "timeRange") {
    return pts.map((pt) => ({
      ...pt,
      date: formatShortDate(pt.timestamp),
    }));
  }

  const [startDate, endDate] = getTimeRangeBounds(periodDays);
  const startTime = new Date(startDate + "T00:00:00Z").getTime();
  const endTime = new Date(endDate + "T00:00:00Z").getTime();

  const byTimestamp = new Map<number, T>(pts.map((p) => [p.timestamp, p]));

  const dayMs = 24 * 60 * 60 * 1000;
  const numDays = Math.floor((endTime - startTime) / dayMs) + 1;

  const out = [];
  for (let i = 0; i < numDays; i++) {
    const timestamp = startTime + i * dayMs;
    const point = byTimestamp.get(timestamp) ?? zeroFactory(timestamp);
    const formattedPoint = {
      ...point,
      date: formatShortDate(point.timestamp),
    };
    out.push(formattedPoint);
  }
  return out;
}
