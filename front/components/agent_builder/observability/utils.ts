import { TOOL_COLORS } from "@app/components/agent_builder/observability/constants";

export function getToolColor(toolName: string, topTools: string[]): string {
  const idx = topTools.indexOf(toolName);
  return TOOL_COLORS[(idx >= 0 ? idx : 0) % TOOL_COLORS.length];
}

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
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTools)
    .map(([toolName]) => toolName);
}

// Helpers for charts

export function computeTopToolsFromCounts(
  counts: Map<string, number>,
  maxTools: number
): string[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTools)
    .map(([name]) => name);
}

export type ValuesPayload = { values: Record<string, number> };

export function makeIsTopForPayload(topTools: string[]) {
  return (payload: ValuesPayload, seriesIdx: number) => {
    for (let k = seriesIdx + 1; k < topTools.length; k++) {
      const nextTool = topTools[k];
      if ((payload.values[nextTool] ?? 0) > 0) {
        return false;
      }
    }
    return true;
  };
}
