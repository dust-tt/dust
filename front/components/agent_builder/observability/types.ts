const TOOL_CHART_MODES = ["version", "step"] as const;

export type ToolChartModeType = (typeof TOOL_CHART_MODES)[number];

export function isToolChartMode(mode: string): mode is ToolChartModeType {
  return TOOL_CHART_MODES.includes(mode as ToolChartModeType);
}

export type ToolChartUsageDatum = {
  percent: number;
  count: number;
};

export type ChartDatum = {
  label: string | number;
  values: Record<string, ToolChartUsageDatum>;
  total?: number;
};

export type ToolChartUsagePayload = {
  name?: string;
  value?: number;
  payload?: ChartDatum;
};

export function isChartDatum(data: unknown): data is ChartDatum {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  if (!("values" in data)) {
    return false;
  }
  const v = (data as { values?: unknown }).values;
  return !(typeof v !== "object" || v === null);
}

export function isToolChartUsagePayload(
  d: unknown
): d is ToolChartUsagePayload {
  if (typeof d !== "object" || d === null) {
    return false;
  }
  const o = d as Record<string, unknown>;
  const valueOk = typeof o.value === "number";
  const nameOk = typeof o.name === "string" || typeof o.name === "undefined";
  const payloadOk = isChartDatum(o.payload);
  return valueOk && nameOk && payloadOk;
}
