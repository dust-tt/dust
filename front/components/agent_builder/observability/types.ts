const TOOL_CHART_MODES = ["version", "step"];

export type ToolChartModeType = (typeof TOOL_CHART_MODES)[number];

export function isToolChartMode(mode: string): mode is ToolChartModeType {
  return mode === "version" || mode === "step";
}

export type ChartDatum = {
  label: string | number;
  values: Record<string, number>;
};
