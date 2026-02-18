import {
  ChartsTooltip,
  SkillSourceTooltip,
} from "@app/components/agent_builder/observability/charts/ChartsTooltip";
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import {
  useSkillSourceData,
  useSkillVersionData,
} from "@app/components/agent_builder/observability/hooks";
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
  Cell,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

const TOOLTIP_STYLES = {
  wrapperStyle: { outline: "none", zIndex: 50 },
  contentStyle: {
    background: "transparent",
    border: "none",
    padding: 0,
    boxShadow: "none",
  },
} as const;

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

  const filterVersion =
    mode === "version" ? selectedVersion?.version : undefined;

  const versionData = useSkillVersionData({
    workspaceId,
    agentConfigurationId,
    period,
    filterVersion,
    disabled: skillMode !== "version",
  });

  const sourceData = useSkillSourceData({
    workspaceId,
    agentConfigurationId,
    period,
    filterVersion,
    disabled: skillMode !== "source",
  });

  const isLoading =
    skillMode === "version" ? versionData.isLoading : sourceData.isLoading;
  const errorMessage =
    skillMode === "version"
      ? versionData.errorMessage
      : sourceData.errorMessage;

  const emptyMessage =
    skillMode === "version"
      ? versionData.emptyMessage
      : "No skill source data available for this period.";

  const legendDescription =
    skillMode === "version"
      ? versionData.legendDescription
      : "Distribution of skill usage by source (agent-enabled vs conversation).";

  const isEmpty =
    skillMode === "version"
      ? versionData.chartData.length === 0
      : sourceData.items.length === 0;

  const legendItems = useMemo(() => {
    if (skillMode === "version") {
      return versionData.topTools.map((t) => ({
        key: t,
        label: t,
        colorClassName: getIndexedColor(t, versionData.topTools),
      }));
    }
    return sourceData.skillNames.map((name) => ({
      key: name,
      label: name,
      colorClassName: getIndexedColor(name, sourceData.skillNames),
    }));
  }, [skillMode, versionData.topTools, sourceData.skillNames]);

  const renderVersionTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <ChartsTooltip
        {...props}
        topTools={versionData.topTools}
        hoveredTool={hoveredTool}
        showLabel
      />
    ),
    [versionData.topTools, hoveredTool]
  );

  const renderSourceTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <SkillSourceTooltip {...props} skillNames={sourceData.skillNames} />
    ),
    [sourceData.skillNames]
  );

  return (
    <ChartContainer
      title="Skills"
      description={legendDescription}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={isEmpty ? emptyMessage : undefined}
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
      {skillMode === "version" ? (
        <BarChart
          data={versionData.chartData}
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
              value: versionData.xAxisLabel,
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
            content={renderVersionTooltip}
            {...TOOLTIP_STYLES}
          />
          {isCustomAgent &&
            mode === "version" &&
            selectedVersion &&
            versionData.chartData.length > 0 && (
              <ReferenceLine
                x={`v${selectedVersion.version}`}
                stroke="hsl(var(--primary))"
                strokeDasharray="5 5"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            )}
          {versionData.topTools.map((toolName) => (
            <Bar
              key={toolName}
              dataKey={(row: ChartDatum) => row.values[toolName]?.count ?? 0}
              stackId="a"
              fill="currentColor"
              className={getIndexedColor(toolName, versionData.topTools)}
              name={toolName}
              shape={
                <RoundedBarShape
                  seriesKey={toolName}
                  stackOrderKeys={versionData.topTools}
                />
              }
              onMouseEnter={() => setHoveredTool(toolName)}
              onMouseLeave={() => setHoveredTool(null)}
            />
          ))}
        </BarChart>
      ) : (
        <BarChart
          data={sourceData.items}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <CartesianGrid
            vertical={false}
            className="stroke-border dark:stroke-border-night"
          />
          <XAxis
            dataKey="skillName"
            tick={false}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            className="text-xs text-muted-foreground dark:text-muted-foreground-night"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            allowDecimals={false}
          />
          <Tooltip
            cursor={false}
            content={renderSourceTooltip}
            {...TOOLTIP_STYLES}
          />
          <Bar dataKey="totalCount" radius={[4, 4, 0, 0]}>
            {sourceData.items.map((item) => (
              <Cell
                key={item.skillName}
                fill="currentColor"
                className={getIndexedColor(
                  item.skillName,
                  sourceData.skillNames
                )}
              />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartContainer>
  );
}
