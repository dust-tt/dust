import { ButtonsSwitch, ButtonsSwitchList } from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import { ChartsTooltip } from "@app/components/agent_builder/observability/charts/ChartsTooltip";
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { useToolUsageData } from "@app/components/agent_builder/observability/hooks";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { RoundedTopBarShape } from "@app/components/agent_builder/observability/shared/ChartShapes";
import type {
  ChartDatum,
  ToolChartModeType,
} from "@app/components/agent_builder/observability/types";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";
import { useAgentMcpConfigurations } from "@app/lib/swr/assistants";

type ToolBarSpec = {
  toolName: string;
  dataKey: string;
  colorClassName: string;
};
type ToolUsageRechartsRow = ChartDatum &
  Record<string, number | string | ChartDatum["values"] | undefined>;

export function ToolUsageChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const [toolMode, setToolMode] = useState<ToolChartModeType>("version");
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  const { configurations: mcpConfigurations } = useAgentMcpConfigurations({
    workspaceId,
    agentConfigurationId,
  });

  const configurationNames = useMemo(() => {
    if (!mcpConfigurations) {
      return new Map<string, string>();
    }
    const map = new Map<string, string>();
    for (const config of mcpConfigurations) {
      if (config.sId && config.name) {
        map.set(config.sId, config.name);
      }
    }
    return map;
  }, [mcpConfigurations]);

  const {
    chartData,
    topTools,
    xAxisLabel,
    emptyMessage,
    legendDescription,
    isLoading,
    errorMessage,
  } = useToolUsageData({
    workspaceId,
    agentConfigurationId,
    period,
    mode: toolMode,
    filterVersion: mode === "version" ? selectedVersion?.version : undefined,
    configurationNames,
  });

  const bars = useMemo<ToolBarSpec[]>(
    () =>
      topTools.map((toolName, idx) => ({
        toolName,
        dataKey: `tool_${idx}`,
        colorClassName: getIndexedColor(toolName, topTools),
      })),
    [topTools]
  );

  const legendItems = useMemo(
    () =>
      bars.map(({ toolName, colorClassName }) => ({
        key: toolName,
        label: toolName,
        colorClassName,
      })),
    [bars]
  );

  const rechartsData = useMemo<ToolUsageRechartsRow[]>(() => {
    return chartData.map((row) => {
      const withKeys: ToolUsageRechartsRow = { ...row };
      for (const { toolName, dataKey } of bars) {
        withKeys[dataKey] = row.values[toolName]?.count ?? 0;
      }
      return withKeys;
    });
  }, [bars, chartData]);

  const renderToolUsageTooltip = useCallback(
    (payload: TooltipContentProps<number, string>) => (
      <ChartsTooltip
        {...payload}
        topTools={topTools}
        hoveredTool={hoveredTool}
      />
    ),
    [topTools, hoveredTool]
  );

  return (
    <ChartContainer
      title="Tools"
      description={legendDescription}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={chartData.length === 0 ? emptyMessage : undefined}
      additionalControls={
        <ButtonsSwitchList defaultValue={toolMode} size="xs">
          <ButtonsSwitch
            value="version"
            label="By version"
            onClick={() => setToolMode("version")}
          />
          <ButtonsSwitch
            value="step"
            label="By step"
            onClick={() => setToolMode("step")}
          />
        </ButtonsSwitchList>
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
    >
      <BarChart
        data={rechartsData}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        stackOffset="expand"
      >
        <CartesianGrid
          vertical={false}
          className="stroke-border dark:stroke-border-night"
        />
        <XAxis
          dataKey="label"
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          label={{
            value: xAxisLabel,
            position: "insideBottom",
            offset: -8,
            style: { textAnchor: "middle" },
          }}
        />
        <YAxis
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          domain={[0, 1]}
          ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
          tickFormatter={(value) => `${Math.round(value * 100)}%`}
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
        {mode === "version" &&
          toolMode === "version" &&
          selectedVersion &&
          chartData.length > 0 && (
            <ReferenceLine
              x={`v${selectedVersion.version}`}
              stroke="hsl(var(--primary))"
              strokeDasharray="5 5"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
          )}
        {bars.map(({ toolName, dataKey, colorClassName }) => (
          <Bar
            key={toolName}
            dataKey={dataKey}
            stackId="a"
            fill="currentColor"
            className={colorClassName}
            name={toolName}
            shape={
              <RoundedTopBarShape toolName={toolName} stackOrder={topTools} />
            }
            onMouseEnter={() => setHoveredTool(toolName)}
            onMouseLeave={() => setHoveredTool(null)}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
