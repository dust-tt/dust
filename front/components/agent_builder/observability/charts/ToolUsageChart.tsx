import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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

import { ChartsTooltip } from "@app/components/agent_builder/observability/charts/ChartsTooltip";
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { useToolUsageData } from "@app/components/agent_builder/observability/hooks";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { RoundedTopBarShape } from "@app/components/agent_builder/observability/shared/ChartShapes";
import type {
  ChartDatum,
  ToolChartModeType,
} from "@app/components/agent_builder/observability/types";
import { isToolChartMode } from "@app/components/agent_builder/observability/types";
import { getToolColor } from "@app/components/agent_builder/observability/utils";

export function ToolUsageChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { period } = useObservability();
  const [mode, setMode] = useState<ToolChartModeType>("version");

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

  const renderToolUsageTooltip = useCallback(
    (payload: TooltipContentProps<number, string>) => (
      <ChartsTooltip {...payload} mode={mode} topTools={topTools} />
    ),
    [mode, topTools]
  );

  return (
    <ChartContainer
      title="Tool Usage"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={chartData.length === 0 ? emptyMessage : undefined}
      additionalControls={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="outline"
              isSelect
              label={mode === "version" ? "Version" : "Step"}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(value) =>
                isToolChartMode(value) && setMode(value)
              }
            >
              <DropdownMenuRadioItem value="version">
                Version
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="step">Step</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }
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
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            allowDecimals={false}
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
          {topTools.map((toolName) => (
            <Bar
              key={toolName}
              dataKey={(row: ChartDatum) => row.values[toolName] ?? 0}
              stackId="a"
              fill="currentColor"
              className={getToolColor(toolName, topTools)}
              name={toolName}
              shape={
                <RoundedTopBarShape toolName={toolName} stackOrder={topTools} />
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
