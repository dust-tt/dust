import { useCallback, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import {
  CHART_HEIGHT,
  MAX_TOOLS_DISPLAYED,
} from "@app/components/agent_builder/observability/constants";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { calculateTopTools } from "@app/components/agent_builder/observability/utils";
import { useAgentToolLatency } from "@app/lib/swr/assistants";

type ChartRow = { version: string; values: Record<string, number> };

interface ToolLatencyChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

function AreaLatencyTooltip({
  active,
  payload,
  label,
}: TooltipContentProps<number, string> & {}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const colorMap: Record<string, string> = {
    avg: "text-[hsl(var(--chart-1))]",
    p50: "text-[hsl(var(--chart-2))]",
    p95: "text-[hsl(var(--chart-3))]",
  };

  const rows = payload
    .filter((p) => typeof p.value === "number")
    .sort((a, b) => (b.name || "").localeCompare(a.name || ""))
    .map((p) => ({
      label: String(p.name),
      value: `${p.value}ms`,
      colorClassName: colorMap[String(p.name)] ?? undefined,
    }));

  return <ChartTooltipCard title={String(label)} rows={rows} />;
}

export function ToolLatencyChart({
  workspaceId,
  agentConfigurationId,
}: ToolLatencyChartProps) {
  const { period, setPeriod } = useObservability();
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  const { toolLatencyByVersion, isToolLatencyLoading, isToolLatencyError } =
    useAgentToolLatency({
      workspaceId,
      agentConfigurationId,
      days: period,
      disabled: !workspaceId || !agentConfigurationId,
    });

  const { versions, topTools, areaData } = useMemo(() => {
    if (!toolLatencyByVersion || toolLatencyByVersion.length === 0) {
      return {
        versions: [],
        topTools: [],
        areaData: [] as Array<{
          tool: string;
          avg: number;
          p50: number;
          p95: number;
        }>,
      };
    }

    // Calculate top tools by weighted average latency
    const top = calculateTopTools(
      toolLatencyByVersion,
      (toolData) => toolData.avgLatencyMs * toolData.count,
      MAX_TOOLS_DISPLAYED
    );

    const versions = toolLatencyByVersion.map((v) => v.version);
    const toolToUse = selectedTool ?? top[0];
    const areaData = toolLatencyByVersion.map((v) => ({
      version: `v${v.version}`,
      avg: v.tools[toolToUse]?.avgLatencyMs ?? 0,
      p50: v.tools[toolToUse]?.p50LatencyMs ?? 0,
      p95: v.tools[toolToUse]?.p95LatencyMs ?? 0,
    }));

    return { versions, topTools: top, areaData };
  }, [toolLatencyByVersion, selectedTool]);

  const renderTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <AreaLatencyTooltip {...props} />
    ),
    []
  );

  const legendItems = [
    { key: "avg", label: "avg", colorClassName: "text-[hsl(var(--chart-1))]" },
    { key: "p50", label: "p50", colorClassName: "text-[hsl(var(--chart-2))]" },
    { key: "p95", label: "p95", colorClassName: "text-[hsl(var(--chart-3))]" },
  ];

  return (
    <ChartContainer
      title="Average Tool Latency by Version"
      isLoading={isToolLatencyLoading}
      additionalControls={
        <select
          className="bg-card rounded border border-border px-2 py-1 text-xs"
          value={selectedTool ?? topTools[0] ?? ""}
          onChange={(e) => setSelectedTool(e.target.value)}
        >
          {topTools.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      }
      errorMessage={
        isToolLatencyError ? "Failed to load tool latency data." : undefined
      }
      emptyMessage={
        areaData.length === 0
          ? "No tool latency data available for this period."
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart
          data={areaData}
          margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
        >
          <defs>
            <linearGradient id="fillAvg" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--chart-1))"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--chart-1))"
                stopOpacity={0.1}
              />
            </linearGradient>
            <linearGradient id="fillP50" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--chart-2))"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--chart-2))"
                stopOpacity={0.1}
              />
            </linearGradient>
            <linearGradient id="fillP95" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--chart-3))"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--chart-3))"
                stopOpacity={0.1}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis
            dataKey="version"
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            label={{
              value: "Latency (ms)",
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            cursor={false}
            content={renderTooltip}
            wrapperStyle={{ outline: "none" }}
            contentStyle={{
              background: "transparent",
              border: "none",
              padding: 0,
              boxShadow: "none",
            }}
          />
          <Area
            type="natural"
            dataKey="avg"
            name="avg"
            fill="url(#fillAvg)"
            stroke="hsl(var(--chart-1))"
            stackId="a"
          />
          <Area
            type="natural"
            dataKey="p50"
            name="p50"
            fill="url(#fillP50)"
            stroke="hsl(var(--chart-2))"
            stackId="a"
          />
          <Area
            type="natural"
            dataKey="p95"
            name="p95"
            fill="url(#fillP95)"
            stroke="hsl(var(--chart-3))"
            stackId="a"
          />
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
      <div className="mt-4 text-xs text-muted-foreground">
        <p>
          Shows avg, p50 (median), and p95 latency (ms) of the top{" "}
          {MAX_TOOLS_DISPLAYED} slowest tools for the selected version.
        </p>
      </div>
    </ChartContainer>
  );
}
