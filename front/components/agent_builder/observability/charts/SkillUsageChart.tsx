import { ChartsTooltip } from "@app/components/agent_builder/observability/charts/ChartsTooltip";
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { useSkillUsageData } from "@app/components/agent_builder/observability/hooks";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import type {
  ChartDatum,
  SkillChartModeType,
} from "@app/components/agent_builder/observability/types";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { RoundedBarShape } from "@app/components/charts/ChartShapes";
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

interface SkillUsageChartProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function SkillUsageChart({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
}: SkillUsageChartProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const [skillMode, setSkillMode] = useState<SkillChartModeType>(
    isCustomAgent ? "version" : "source"
  );
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  const {
    chartData,
    topTools,
    xAxisLabel,
    emptyMessage,
    legendDescription,
    isLoading,
    errorMessage,
  } = useSkillUsageData({
    workspaceId,
    agentConfigurationId,
    period,
    mode: skillMode,
    filterVersion: mode === "version" ? selectedVersion?.version : undefined,
  });

  const legendItems = useMemo(
    () =>
      topTools.map((t) => ({
        key: t,
        label: t,
        colorClassName: getIndexedColor(t, topTools),
      })),
    [topTools]
  );

  const renderSkillUsageTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <ChartsTooltip
        {...props}
        topTools={topTools}
        hoveredTool={hoveredTool}
        showLabel
      />
    ),
    [topTools, hoveredTool]
  );

  return (
    <ChartContainer
      title="Skills"
      description={legendDescription}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={chartData.length === 0 ? emptyMessage : undefined}
      additionalControls={
        isCustomAgent && (
          <ButtonsSwitchList defaultValue={skillMode} size="xs">
            <ButtonsSwitch
              value="version"
              label="By version"
              onClick={() => setSkillMode("version")}
            />
            <ButtonsSwitch
              value="source"
              label="By source"
              onClick={() => setSkillMode("source")}
            />
          </ButtonsSwitchList>
        )
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
    >
      <BarChart
        data={chartData}
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
          content={renderSkillUsageTooltip}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        {isCustomAgent &&
          mode === "version" &&
          skillMode === "version" &&
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
        {topTools.map((toolName) => (
          <Bar
            key={toolName}
            dataKey={(row: ChartDatum) => row.values[toolName]?.count ?? 0}
            stackId="a"
            fill="currentColor"
            className={getIndexedColor(toolName, topTools)}
            name={toolName}
            shape={
              <RoundedBarShape seriesKey={toolName} stackOrderKeys={topTools} />
            }
            onMouseEnter={() => setHoveredTool(toolName)}
            onMouseLeave={() => setHoveredTool(null)}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
