import { TOOL_COLORS } from "@app/components/agent_builder/observability/constants";

export type ValuesPayload = { values: Record<string, number> };

export function getToolColor(toolName: string, topTools: string[]): string {
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
