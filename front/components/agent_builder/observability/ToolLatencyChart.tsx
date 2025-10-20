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
  TOOL_COLORS,
} from "@app/components/agent_builder/observability/constants";
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

  const getColorForTool = (toolName: string) => {
    const idx = topTools.indexOf(toolName);
    return TOOL_COLORS[(idx >= 0 ? idx : 0) % TOOL_COLORS.length];
  };

  // Extract version from label (format: "v123")
  const version = String(label).replace(/^v/, "");
  const versionData = toolLatencyByVersion.find((v) => v.version === version);

  const rows = payload
    .filter((p) => typeof p.value === "number" && p.value > 0)
    .sort((a, b) => b.value - a.value)
    .flatMap((p) => {
      const toolName = p.name || "";
      const toolData = versionData?.tools[toolName];

      if (!toolData) {
        return [
          {
            label: toolName,
            value: `${p.value}ms`,
            colorClassName: getColorForTool(toolName),
          },
        ];
      }

      return [
        {
          label: `${toolName} (avg)`,
          value: `${toolData.avgLatencyMs}ms`,
          colorClassName: getColorForTool(toolName),
        },
        {
          label: `${toolName} (p50)`,
          value: `${toolData.p50LatencyMs}ms`,
          colorClassName: getColorForTool(toolName),
        },
        {
          label: `${toolName} (p95)`,
          value: `${toolData.p95LatencyMs}ms`,
          colorClassName: getColorForTool(toolName),
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

  const legendItems = topTools.map((toolName, idx) => ({
    key: toolName,
    label: toolName,
    colorClassName: TOOL_COLORS[idx % TOOL_COLORS.length],
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
              content={renderTooltip}
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
            {MAX_TOOLS_DISPLAYED} slowest tools for each agent version. Hover
            over bars to see avg, p50 (median), and p95 latency values.
          </p>
        </div>
      </>
    </ChartContainer>
  );
}
