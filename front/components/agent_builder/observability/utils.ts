import {
  OTHER_TOOLS_LABEL,
  TOOL_COLORS,
} from "@app/components/agent_builder/observability/constants";
import type { ObservabilityMode } from "@app/components/agent_builder/observability/ObservabilityContext";

export type VersionMarker = { version: string; timestamp: string };

export type ValuesPayload = { values: Record<string, number> };

export function getToolColor(toolName: string, topTools: string[]): string {
  if (toolName === OTHER_TOOLS_LABEL) {
    return "text-muted-foreground";
  }

  const idx = topTools.indexOf(toolName);
  return TOOL_COLORS[(idx >= 0 ? idx : 0) % TOOL_COLORS.length];
}

// Returns the top N tools by aggregating metrics across versions
export function calculateTopTools<T>(
  dataByVersion: { version: string; tools: Record<string, T> }[],
  extractMetric: (tool: T) => number,
  maxTools: number
): string[] {
  const toolMetrics = new Map<string, number>();

  for (const v of dataByVersion) {
    for (const [toolName, toolData] of Object.entries(v.tools)) {
      const metric = extractMetric(toolData);
      toolMetrics.set(toolName, (toolMetrics.get(toolName) ?? 0) + metric);
    }
  }

  return Array.from(toolMetrics.entries())
    .sort((a, b) => {
      const metricDiff = b[1] - a[1];
      return metricDiff !== 0 ? metricDiff : a[0].localeCompare(b[0]);
    })
    .slice(0, maxTools)
    .map(([toolName]) => toolName);
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

// Filters a generic time-series of points with a `date` string to the
// selected version window determined by version markers. If no selection or
// markers are provided, returns the original points.
export function filterTimeSeriesByVersionWindow<T extends { date: string }>(
  points: T[] | undefined,
  mode: ObservabilityMode,
  selectedVersion: string | null,
  versionMarkers?: VersionMarker[] | null
): T[] {
  const pts = points ?? [];
  if (!pts.length) {
    return pts;
  }

  if (mode !== "version" || !selectedVersion || !versionMarkers?.length) {
    return pts;
  }

  const idx = versionMarkers.findIndex((m) => m.version === selectedVersion);
  if (idx < 0) {
    return pts;
  }

  const start = new Date(versionMarkers[idx].timestamp).getTime();
  const end =
    idx + 1 < versionMarkers.length
      ? new Date(versionMarkers[idx + 1].timestamp).getTime()
      : undefined;

  return pts.filter((p) => {
    const t = new Date(p.date).getTime();
    return t >= start && (end === undefined || t < end);
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
export function padSeriesToTimeRange<T extends { date: string }>(
  points: T[] | undefined,
  mode: ObservabilityMode,
  periodDays: number,
  zeroFactory: (date: string) => T
): T[] {
  const pts = points ?? [];
  if (mode !== "timeRange") {
    return pts;
  }
  const [startDate, endDate] = getTimeRangeBounds(periodDays);
  const byDate = new Map<string, T>(pts.map((p) => [p.date, p]));

  const startTime = new Date(startDate + "T00:00:00Z").getTime();
  const endTime = new Date(endDate + "T00:00:00Z").getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const numDays = Math.floor((endTime - startTime) / dayMs) + 1;

  const out: T[] = [];
  for (let i = 0; i < numDays; i++) {
    const date = formatUTCDateString(new Date(startTime + i * dayMs));
    out.push(byDate.get(date) ?? zeroFactory(date));
  }
  return out;
}
