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
} from "@app/components/agent_builder/observability/constants";
import {
  calculateTopTools,
  getToolColor,
} from "@app/components/agent_builder/observability/utils";
import type { ToolLatencyByVersion } from "@app/lib/api/assistant/observability/tool_latency";
import { useAgentToolLatency } from "@app/lib/swr/assistants";

type ChartRow = { version: string; values: Record<string, number> };

interface ToolLatencyChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

function ToolLatencyTooltip({
  active,
  payload,
  label,
  topTools,
  toolLatencyByVersion,
}: TooltipContentProps<number, string> & {
  topTools: string[];
  toolLatencyByVersion: ToolLatencyByVersion[];
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  // Extract version from label (format: "v123")
  const version = String(label).replace(/^v/, "");
  const versionData = toolLatencyByVersion.find((v) => v.version === version);

  const rows = payload
    .filter((p) => typeof p.value === "number" && p.value > 0)
    .sort((a, b) => b.value - a.value)
    .flatMap((p) => {
      const toolName = p.name || "";
      const toolData = versionData?.tools[toolName];
      const colorClassName = getToolColor(toolName, topTools);

      if (!toolData) {
        return [
          {
            label: toolName,
            value: `${p.value}ms`,
            colorClassName,
          },
        ];
      }

      return [
        {
          label: `${toolName} (avg)`,
          value: `${toolData.avgLatencyMs}ms`,
          colorClassName,
        },
        {
          label: `${toolName} (p50)`,
          value: `${toolData.p50LatencyMs}ms`,
          colorClassName,
        },
        {
          label: `${toolName} (p95)`,
          value: `${toolData.p95LatencyMs}ms`,
          colorClassName,
        },
      ];
    });

  return <ChartTooltipCard title={String(label)} rows={rows} />;
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

    // Calculate top tools by weighted average latency
    const top = calculateTopTools(
      toolLatencyByVersion,
      (toolData) => toolData.avgLatencyMs * toolData.count,
      MAX_TOOLS_DISPLAYED
    );

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

  const renderTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <ToolLatencyTooltip
        {...props}
        topTools={topTools}
        toolLatencyByVersion={toolLatencyByVersion ?? []}
      />
    ),
    [topTools, toolLatencyByVersion]
  );

  const legendItems = topTools.map((toolName) => ({
    key: toolName,
    label: toolName,
    colorClassName: getToolColor(toolName, topTools),
  }));

  return (
    <ChartContainer
      title="Average Tool Latency by Version"
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
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
          barGap={2}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="version" className="text-xs text-muted-foreground" />
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
            content={renderTooltip}
          />
          {topTools.map((toolName) => (
            <Bar
              key={toolName}
              dataKey={(row: ChartRow) => row.values[toolName] ?? 0}
              fill="currentColor"
              className={getToolColor(toolName, topTools)}
              name={toolName}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
      <div className="mt-4 text-xs text-muted-foreground">
        <p>
          Shows the average execution latency (ms) of the top{" "}
          {MAX_TOOLS_DISPLAYED} slowest tools for each agent version. Hover over
          bars to see avg, p50 (median), and p95 latency values.
        </p>
      </div>
    </ChartContainer>
  );
}
