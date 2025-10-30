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
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import { ToolUsageTooltip } from "@app/components/agent_builder/observability/charts/ToolUsageTooltip";
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { useToolUsageData } from "@app/components/agent_builder/observability/hooks";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/shared/ChartLegend";
import type {
  ChartDatum,
  ToolChartModeType,
} from "@app/components/agent_builder/observability/types";
import { isToolChartMode } from "@app/components/agent_builder/observability/types";
import { getToolColor } from "@app/components/agent_builder/observability/utils";

const ROUNDED_TOP_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
// Recharts typings only allow number|string on Cell.radius; cast to pass tuple.
const CELL_CORNER_RADIUS = ROUNDED_TOP_RADIUS as unknown as number;

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

  const topToolNameByEntry = useMemo(
    () =>
      chartData.map((datum) => {
        for (let idx = topTools.length - 1; idx >= 0; idx--) {
          const tool = topTools[idx];
          if ((datum.values[tool] ?? 0) > 0) {
            return tool;
          }
        }

        return undefined;
      }),
    [chartData, topTools]
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
            >
              {chartData.map((entry, entryIdx) => (
                <Cell
                  key={`${String(entry.label)}-${toolName}`}
                  radius={
                    topToolNameByEntry[entryIdx] === toolName &&
                    (entry.values[toolName] ?? 0) > 0
                      ? CELL_CORNER_RADIUS
                      : undefined
                  }
                />
              ))}
            </Bar>
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
