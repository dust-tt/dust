const TOOL_CHART_MODES = ["version", "step"] as const;

export type ToolChartModeType = (typeof TOOL_CHART_MODES)[number];

export function isToolChartMode(mode: string): mode is ToolChartModeType {
  return TOOL_CHART_MODES.includes(mode as ToolChartModeType);
}

export type ChartDatum = {
  label: string | number;
  values: Record<string, number>;
};
