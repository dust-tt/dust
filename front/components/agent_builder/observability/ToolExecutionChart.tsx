import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import { ChartContainer } from "@app/components/agent_builder/observability/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/ChartTooltip";
import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  CHART_HEIGHT,
  DEFAULT_PERIOD_DAYS,
  MAX_TOOLS_DISPLAYED,
  PERCENTAGE_MULTIPLIER,
  TOOL_COLORS,
} from "@app/components/agent_builder/observability/constants";
import { useAgentToolExecution } from "@app/lib/swr/assistants";

type ChartRow = { version: string; values: Record<string, number> };

interface ToolExecutionChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

function ToolExecutionTooltip({
  active,
  payload,
  label,
  topTools,
}: TooltipContentProps<number, string> & { topTools: string[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const getColorForTool = (toolName: string) => {
    const idx = topTools.indexOf(toolName);
    return TOOL_COLORS[(idx >= 0 ? idx : 0) % TOOL_COLORS.length];
  };

  const rows = payload
    .filter((p) => typeof p.value === "number" && p.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((p) => ({
      label: p.name || "",
      value: `${p.value}%`,
      colorClassName: getColorForTool(p.name || ""),
    }));

  return <ChartTooltipCard title={String(label)} rows={rows} />;
}

export function ToolExecutionChart({
  workspaceId,
  agentConfigurationId,
}: ToolExecutionChartProps) {
  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);

  const {
    toolExecutionByVersion,
    isToolExecutionLoading,
    isToolExecutionError,
  } = useAgentToolExecution({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId,
  });

  const { chartData, topTools } = useMemo(() => {
    if (!toolExecutionByVersion || toolExecutionByVersion.length === 0) {
      return { chartData: [], topTools: [] };
    }

    // Aggregate total counts per tool across all versions
    const toolTotalCounts = new Map<string, number>();
    for (const v of toolExecutionByVersion) {
      for (const [toolName, toolData] of Object.entries(v.tools)) {
        toolTotalCounts.set(
          toolName,
          (toolTotalCounts.get(toolName) ?? 0) + toolData.count
        );
      }
    }

    // Top tools by total usage
    const top = Array.from(toolTotalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOOLS_DISPLAYED)
      .map(([toolName]) => toolName);

    // Build rows with numeric series for tools
    const rows: ChartRow[] = toolExecutionByVersion.map((v) => {
      const versionTotal = Object.values(v.tools).reduce(
        (acc, t) => acc + t.count,
        0
      );

      const toolValues: Record<string, number> = {};
      for (const toolName of top) {
        const t = v.tools[toolName];
        toolValues[toolName] = t
          ? versionTotal > 0
            ? Math.round((t.count / versionTotal) * PERCENTAGE_MULTIPLIER)
            : 0
          : 0;
      }

      return { version: `v${v.version}`, values: toolValues };
    });

    return { chartData: rows, topTools: top };
  }, [toolExecutionByVersion]);

  const renderTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <ToolExecutionTooltip {...props} topTools={topTools} />
    ),
    [topTools]
  );

  const legendItems = topTools.map((toolName, idx) => ({
    key: toolName,
    label: toolName,
    colorClassName: TOOL_COLORS[idx % TOOL_COLORS.length],
  }));

  return (
    <ChartContainer
      title="Tool Usage by Version"
      period={period}
      onPeriodChange={setPeriod}
      isLoading={isToolExecutionLoading}
      errorMessage={
        isToolExecutionError ? "Failed to load tool execution data." : undefined
      }
      emptyMessage={
        chartData.length === 0
          ? "No tool execution data available for this period."
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="version" className="text-xs text-muted-foreground" />
          <YAxis
            className="text-xs text-muted-foreground"
            label={{
              value: "Usage %",
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--border) / 0.1)" }}
            content={renderTooltip}
          />
          {topTools.map((toolName, idx) => (
            <Bar
              key={toolName}
              dataKey={(row: ChartRow) => row.values[toolName] ?? 0}
              stackId="a"
              fill="currentColor"
              className={TOOL_COLORS[idx % TOOL_COLORS.length]}
              name={toolName}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
      <div className="mt-4 text-xs text-muted-foreground">
        <p>
          Shows the relative usage frequency (%) of the top{" "}
          {MAX_TOOLS_DISPLAYED} tools for each agent version. Higher percentages
          indicate more frequent tool usage within that version.
        </p>
      </div>
    </ChartContainer>
  );
}
