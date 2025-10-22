import { useCallback, useMemo } from "react";
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
import {
  CHART_HEIGHT,
  MAX_TOOLS_DISPLAYED,
  PERCENTAGE_MULTIPLIER,
} from "@app/components/agent_builder/observability/constants";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { getToolColor } from "@app/components/agent_builder/observability/utils";
import { useAgentToolStepIndex } from "@app/lib/swr/assistants";

type ChartRow = { step: number; values: Record<string, number> };

function ToolStepIndexTooltip({
  active,
  payload,
  label,
  topTools,
}: TooltipContentProps<number, string> & { topTools: string[] }) {
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

  return <ChartTooltipCard title={`Step ${String(label)}`} rows={rows} />;
}

export function ToolStepIndexChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { period } = useObservability();
  const { toolStepIndexByStep, isToolStepIndexLoading, isToolStepIndexError } =
    useAgentToolStepIndex({
      workspaceId,
      agentConfigurationId,
      days: period,
      disabled: !workspaceId || !agentConfigurationId,
    });

  const { chartData, topTools } = useMemo(() => {
    if (!toolStepIndexByStep || toolStepIndexByStep.length === 0) {
      return { chartData: [], topTools: [] as string[] };
    }

    // Aggregate total counts per tool across all steps to determine top tools
    const toolTotalCounts = new Map<string, number>();
    for (const s of toolStepIndexByStep) {
      for (const [toolName, toolData] of Object.entries(s.tools)) {
        toolTotalCounts.set(
          toolName,
          (toolTotalCounts.get(toolName) ?? 0) + toolData.count
        );
      }
    }

    const top = Array.from(toolTotalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOOLS_DISPLAYED)
      .map(([toolName]) => toolName);

    // Build rows with percentage values for top tools per step
    const rows: ChartRow[] = toolStepIndexByStep.map((s) => {
      const stepTotal = s.total > 0 ? s.total : 0;
      const toolValues: Record<string, number> = {};
      for (const toolName of top) {
        const t = s.tools[toolName];
        toolValues[toolName] = t
          ? stepTotal > 0
            ? Math.round((t.count / stepTotal) * PERCENTAGE_MULTIPLIER)
            : 0
          : 0;
      }
      return { step: s.step, values: toolValues };
    });

    return { chartData: rows, topTools: top };
  }, [toolStepIndexByStep]);

  const legendItems = topTools.map((toolName) => ({
    key: toolName,
    label: toolName,
    colorClassName: getToolColor(toolName, topTools),
  }));

  const renderTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <ToolStepIndexTooltip {...props} topTools={topTools} />
    ),
    [topTools]
  );

  return (
    <ChartContainer
      title="Tool Usage by Step Index"
      isLoading={isToolStepIndexLoading}
      errorMessage={
        isToolStepIndexError
          ? "Failed to load step index distribution."
          : undefined
      }
      emptyMessage={
        chartData.length === 0
          ? "No tool usage by step index for this period."
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis
            dataKey="step"
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
              value: "Usage %",
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
          {topTools.map((toolName) => (
            <Bar
              key={toolName}
              dataKey={(row: ChartRow) => row.values[toolName] ?? 0}
              stackId="a"
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
          Shows relative usage (%) of top {MAX_TOOLS_DISPLAYED} tools per step
          index within a message. Useful to understand when tools are invoked.
        </p>
      </div>
    </ChartContainer>
  );
}
