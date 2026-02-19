import { ChartsTooltip } from "@app/components/agent_builder/observability/charts/ChartsTooltip";
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import {
  useSkillSourceData,
  useSkillVersionData,
} from "@app/components/agent_builder/observability/hooks";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import {
  type ChartDatum,
  isSkillSourceItem,
  type SkillChartModeType,
} from "@app/components/agent_builder/observability/types";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { RoundedBarShape } from "@app/components/charts/ChartShapes";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";
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

const MAX_SELECTED_SKILLS = 10;
const DEFAULT_SELECTED_SKILLS = 5;

function getSkillSelectorLabel(selectedSkills: string[]): string {
  if (selectedSkills.length === 0) {
    return "Select skills";
  }
  if (selectedSkills.length === 1) {
    return selectedSkills[0];
  }
  return `${selectedSkills.length} skills`;
}

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
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

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

  // Auto-select top skills when source data loads.
  useEffect(() => {
    if (sourceData.skillNames.length > 0 && selectedSkills.length === 0) {
      setSelectedSkills(
        sourceData.skillNames.slice(0, DEFAULT_SELECTED_SKILLS)
      );
    }
  }, [sourceData.skillNames, selectedSkills.length]);

  const filteredSourceItems = useMemo(() => {
    const selected = new Set(selectedSkills);
    return sourceData.items.filter((item) => selected.has(item.skillName));
  }, [sourceData.items, selectedSkills]);

  const filteredSkillNames = useMemo(
    () => filteredSourceItems.map((item) => item.skillName),
    [filteredSourceItems]
  );

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
      : filteredSourceItems.length === 0;

  const legendItems = useMemo(() => {
    if (skillMode === "version") {
      return versionData.topTools.map((t) => ({
        key: t,
        label: t,
        colorClassName: getIndexedColor(t, versionData.topTools),
      }));
    }
    return filteredSkillNames.map((name) => ({
      key: name,
      label: name,
      colorClassName: getIndexedColor(name, filteredSkillNames),
    }));
  }, [skillMode, versionData.topTools, filteredSkillNames]);

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
    (props: TooltipContentProps<number, string>) => {
      const { active, payload: tooltipPayload } = props;
      if (!active || !tooltipPayload || tooltipPayload.length === 0) {
        return null;
      }
      const first = tooltipPayload[0];
      if (!first?.payload || !isSkillSourceItem(first.payload)) {
        return null;
      }
      const item = first.payload;
      const sourceEntries = Object.entries(item.sources)
        .map(([key, val]): [string, number] => [key, Number(val)])
        .sort(([, a], [, b]) => b - a);
      return (
        <ChartTooltipCard
          title={item.skillName}
          rows={sourceEntries.map(([label, count]) => ({
            label,
            value: count,
            percent:
              item.totalCount > 0
                ? Math.round((count / item.totalCount) * 100)
                : 0,
          }))}
          footer={`Total: ${item.totalCount}`}
        />
      );
    },
    []
  );

  const handleSkillToggle = (skill: string, checked: boolean) => {
    if (checked) {
      if (selectedSkills.length < MAX_SELECTED_SKILLS) {
        setSelectedSkills([...selectedSkills, skill]);
      }
    } else {
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    }
  };

  const skillSelector = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={getSkillSelectorLabel(selectedSkills)}
          size="xs"
          variant="outline"
          isSelect
          disabled={sourceData.isLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          Select skills (max {MAX_SELECTED_SKILLS})
        </DropdownMenuLabel>
        <div className="max-h-64 overflow-auto">
          {sourceData.skillNames.map((skill) => (
            <DropdownMenuCheckboxItem
              key={skill}
              label={skill}
              checked={selectedSkills.includes(skill)}
              disabled={
                !selectedSkills.includes(skill) &&
                selectedSkills.length >= MAX_SELECTED_SKILLS
              }
              onCheckedChange={(checked) => handleSkillToggle(skill, checked)}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <ChartContainer
      title="Skills"
      description={legendDescription}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={isEmpty ? emptyMessage : undefined}
      additionalControls={
        <div className="flex items-center gap-2">
          {skillMode === "source" && skillSelector}
          {isCustomAgent && (
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
          )}
        </div>
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
            wrapperStyle={{ outline: "none", zIndex: 50 }}
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
          data={filteredSourceItems}
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
            wrapperStyle={{ outline: "none", zIndex: 50 }}
          />
          <Bar dataKey="totalCount" radius={[4, 4, 0, 0]}>
            {filteredSourceItems.map((item) => (
              <Cell
                key={item.skillName}
                fill="currentColor"
                className={getIndexedColor(item.skillName, filteredSkillNames)}
              />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartContainer>
  );
}
