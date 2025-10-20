import { useMemo, useState } from "react";
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
  TOOL_COLORS,
} from "@app/components/agent_builder/observability/constants";
import { useAgentToolLatency } from "@app/lib/swr/assistants";

type ChartRow = { version: string; values: Record<string, number> };

interface ToolLatencyChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

export function ToolLatencyChart({
  workspaceId,
  agentConfigurationId,
}: ToolLatencyChartProps) {
  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);

  const { toolLatencyByVersion, isToolLatencyLoading, isToolLatencyError } =
    useAgentToolLatency({
      workspaceId,
      agentConfigurationId,
      days: period,
      disabled: !workspaceId || !agentConfigurationId,
    });

  const { chartData, topTools } = useMemo(() => {
    if (!toolLatencyByVersion || toolLatencyByVersion.length === 0) {
      return { chartData: [], topTools: [] };
    }

    // Aggregate weighted average latency per tool across all versions
    const toolMetrics = new Map<
      string,
      { totalLatency: number; totalCount: number }
    >();
    for (const v of toolLatencyByVersion) {
      for (const [toolName, toolData] of Object.entries(v.tools)) {
        const existing = toolMetrics.get(toolName) ?? {
          totalLatency: 0,
          totalCount: 0,
        };
        toolMetrics.set(toolName, {
          totalLatency:
            existing.totalLatency + toolData.avgLatencyMs * toolData.count,
          totalCount: existing.totalCount + toolData.count,
        });
      }
    }

    // Top tools by weighted average latency
    const top = Array.from(toolMetrics.entries())
      .map(([toolName, metrics]) => ({
        toolName,
        avgLatency: metrics.totalLatency / metrics.totalCount,
      }))
      .sort((a, b) => b.avgLatency - a.avgLatency)
      .slice(0, MAX_TOOLS_DISPLAYED)
      .map((t) => t.toolName);

    // Build rows with average latency values for each tool
    const rows: ChartRow[] = toolLatencyByVersion.map((v) => {
      const toolValues: Record<string, number> = {};
      for (const toolName of top) {
        const t = v.tools[toolName];
        toolValues[toolName] = t ? t.avgLatencyMs : 0;
      }

      return { version: `v${v.version}`, values: toolValues };
    });

    return { chartData: rows, topTools: top };
  }, [toolLatencyByVersion]);

  function CustomTooltip(props: TooltipContentProps<number, string>) {
    const { active, payload, label } = props;
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
        value: `${p.value}ms`,
        colorClassName: getColorForTool(p.name || ""),
      }));

    return <ChartTooltipCard title={String(label)} rows={rows} />;
  }

  const legendItems = topTools.map((toolName, idx) => ({
    key: toolName,
    label: toolName,
    colorClassName: TOOL_COLORS[idx % TOOL_COLORS.length],
  }));

  return (
    <ChartContainer
      title="Tool Latency by Version"
      period={period}
      onPeriodChange={setPeriod}
      isLoading={isToolLatencyLoading}
      errorMessage={
        isToolLatencyError ? "Failed to load tool latency data." : undefined
      }
      emptyMessage={
        chartData.length === 0
          ? "No tool latency data available for this period."
          : undefined
      }
    >
      <>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
            barGap={2}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="version"
              className="text-xs text-muted-foreground"
            />
            <YAxis
              className="text-xs text-muted-foreground"
              label={{
                value: "Latency (ms)",
                angle: -90,
                position: "insideLeft",
                style: { textAnchor: "middle" },
              }}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--border) / 0.1)" }}
              content={CustomTooltip}
            />
            {topTools.map((toolName, idx) => (
              <Bar
                key={toolName}
                dataKey={(row: ChartRow) => row.values[toolName] ?? 0}
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
            Shows the average execution latency (ms) of the top{" "}
            {MAX_TOOLS_DISPLAYED} slowest tools for each agent version. Higher
            values indicate slower tool execution times.
          </p>
        </div>
      </>
    </ChartContainer>
  );
}
