import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
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
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { useToolUsageData } from "@app/components/agent_builder/observability/hooks";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ToolUsageTooltip } from "@app/components/agent_builder/observability/ToolUsageTooltip";
import type {
  ChartDatum,
  Mode,
} from "@app/components/agent_builder/observability/types";
import {
  getToolColor,
  makeIsTopForPayload,
} from "@app/components/agent_builder/observability/utils";
import { RoundedTopBarShape } from "@app/components/charts/ChartShapes";

export function ToolUsageChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { period } = useObservability();
  const [mode, setMode] = useState<Mode>("version");

  const {
    chartData,
    topTools,
    xAxisLabel,
    emptyMessage,
    legendDescription,
    isLoading,
    errorMessage,
  } = useToolUsageData({ workspaceId, agentConfigurationId, period, mode });

  const legendItems = useMemo(
    () =>
      topTools.map((t) => ({
        key: t,
        label: t,
        colorClassName: getToolColor(t, topTools),
      })),
    [topTools]
  );

  const isTopForPayload = useMemo(
    () => makeIsTopForPayload(topTools),
    [topTools]
  );

  const additionalControls = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          isSelect
          label={mode === "version" ? "version" : "step"}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem label="version" onClick={() => setMode("version")} />
        <DropdownMenuItem label="step" onClick={() => setMode("step")} />
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderToolUsageTooltip = useCallback(
    (payload: TooltipContentProps<number, string>) => (
      <ToolUsageTooltip {...payload} mode={mode} topTools={topTools} />
    ),
    [mode, topTools]
  );

  return (
    <ChartContainer
      title="Tool Usage"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={chartData.length === 0 ? emptyMessage : undefined}
      additionalControls={additionalControls}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis
            dataKey="label"
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            label={{
              value: xAxisLabel,
              position: "insideBottom",
              offset: -2,
              style: { textAnchor: "middle" },
            }}
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
            content={renderToolUsageTooltip}
            wrapperStyle={{ outline: "none" }}
            contentStyle={{
              background: "transparent",
              border: "none",
              padding: 0,
              boxShadow: "none",
            }}
          />
          {topTools.map((toolName, idx) => (
            <Bar
              key={toolName}
              dataKey={(row: ChartDatum) => row.values[toolName] ?? 0}
              stackId="a"
              fill="currentColor"
              className={getToolColor(toolName, topTools)}
              name={toolName}
              shape={
                <RoundedTopBarShape
                  seriesIdx={idx}
                  isTopForPayload={isTopForPayload}
                />
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
      <div className="mt-4 text-xs text-muted-foreground">
        <p>{legendDescription}</p>
      </div>
    </ChartContainer>
  );
}
