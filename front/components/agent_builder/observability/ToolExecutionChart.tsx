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
  PERCENTAGE_MULTIPLIER,
  TOOL_COLORS,
} from "@app/components/agent_builder/observability/constants";
import { useAgentToolExecution } from "@app/lib/swr/assistants";

export function ToolExecutionChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
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

    // Collect all unique tools across all versions
    const allToolsSet = new Set<string>();
    const toolTotalCounts = new Map<string, number>();

    toolExecutionByVersion.forEach((versionData) => {
      Object.entries(versionData.tools).forEach(([toolName, toolData]) => {
        allToolsSet.add(toolName);
        toolTotalCounts.set(
          toolName,
          (toolTotalCounts.get(toolName) ?? 0) + toolData.count
        );
      });
    });

    // Get top tools by total usage
    const sortedTools = Array.from(toolTotalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOOLS_DISPLAYED)
      .map(([toolName]) => toolName);

    // Transform data for stacked bar chart
    const data = toolExecutionByVersion.map((versionData) => {
      const dataPoint: Record<string, string | number> = {
        version: `v${versionData.version}`,
      };

      // Calculate total for this version
      let versionTotal = 0;
      Object.entries(versionData.tools).forEach(([, toolData]) => {
        versionTotal += toolData.count;
      });

      // Add tool counts as percentages
      sortedTools.forEach((toolName) => {
        const toolData = versionData.tools[toolName];
        if (toolData) {
          const percentage =
            versionTotal > 0
              ? Math.round(
                  (toolData.count / versionTotal) * PERCENTAGE_MULTIPLIER
                )
              : 0;
          dataPoint[toolName] = percentage;
        } else {
          dataPoint[toolName] = 0;
        }
      });

      return dataPoint;
    });

    return { chartData: data, topTools: sortedTools };
  }, [toolExecutionByVersion]);

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
        value: `${p.value}%`,
        colorClassName: getColorForTool(p.name || ""),
      }));

    return (
      <ChartTooltipCard
        title={typeof label === "string" ? label : String(label ?? "")}
        rows={rows}
      />
    );
  }

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
      isError={isToolExecutionError}
      isEmpty={chartData.length === 0}
      errorMessage="Failed to load tool execution data."
      emptyMessage="No tool execution data available for this period."
    >
      <>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="version"
              className="text-xs text-muted-foreground"
            />
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
              content={CustomTooltip}
            />
            {topTools.map((toolName, idx) => (
              <Bar
                key={toolName}
                dataKey={toolName}
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
            {MAX_TOOLS_DISPLAYED} tools for each agent version. Higher
            percentages indicate more frequent tool usage within that version.
          </p>
        </div>
      </>
    </ChartContainer>
  );
}
