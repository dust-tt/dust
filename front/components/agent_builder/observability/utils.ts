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
