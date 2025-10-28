import React from "react";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import type { ToolChartModeType } from "@app/components/agent_builder/observability/types";
import { getToolColor } from "@app/components/agent_builder/observability/utils";

export interface ToolUsageTooltipProps
  extends TooltipContentProps<number, string> {
  mode: ToolChartModeType;
  topTools: string[];
}

export function ToolUsageTooltip({
  active,
  payload,
  label,
  mode,
  topTools,
}: ToolUsageTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const rows = payload
    .filter((p) => typeof p.value === "number" && p.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((p) => ({
      label: p.name || "",
      value: `${p.value}%`,
      colorClassName: getToolColor(p.name || "", topTools),
    }));

  const title = mode === "step" ? `Step ${String(label)}` : String(label);
  return <ChartTooltipCard title={title} rows={rows} />;
}
