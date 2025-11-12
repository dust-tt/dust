import {
  OTHER_TOOLS_LABEL,
  TOOL_COLORS,
} from "@app/components/agent_builder/observability/constants";
import type { ObservabilityMode } from "@app/components/agent_builder/observability/ObservabilityContext";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import { formatShortDate } from "@app/lib/utils/timestamps";

export type VersionMarker = { version: string; timestamp: number };

export type ValuesPayload = { values: Record<string, number> };

export function getToolColor(toolName: string, topTools: string[]): string {
  if (toolName === OTHER_TOOLS_LABEL) {
    return "text-blue-300 dark:text-blue-300-night";
  }

  const idx = topTools.indexOf(toolName);
  return TOOL_COLORS[(idx >= 0 ? idx : 0) % TOOL_COLORS.length];
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

const WARNING_THRESHOLD = 5;
const CRITICAL_THRESHOLD = 10;

export function getErrorRateChipInfo(errorRate: number) {
  if (errorRate < WARNING_THRESHOLD) {
    return {
      color: "success" as const,
      label: "HEALTHY",
    };
  }

  if (errorRate < CRITICAL_THRESHOLD) {
    return {
      color: "info" as const,
      label: "WARNING",
    };
  }

  return {
    color: "warning" as const,
    label: "CRITICAL",
  };
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
    const formattedPts = pts.map((pt) => ({
      ...pt,
      date: formatShortDate(pt.timestamp),
    }));
    return formattedPts;
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
