import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import {
  getIndexedColor,
  getTimeRangeBounds,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import {
  useWorkspaceSkills,
  useWorkspaceSkillUsage,
} from "@app/lib/swr/workspaces";
import { formatShortDate } from "@app/lib/utils/timestamps";
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
import moment from "moment-timezone";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

type SkillUsageDisplayMode = "users" | "executions";

const MAX_SELECTED_SKILLS = 5;

interface SkillUsageChartPoint {
  timestamp: number;
  date: string;
  values: Record<string, number>;
}

function isSkillUsageChartPoint(value: unknown): value is SkillUsageChartPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    "timestamp" in value &&
    typeof value.timestamp === "number" &&
    "date" in value &&
    typeof value.date === "string" &&
    "values" in value &&
    typeof value.values === "object" &&
    value.values !== null
  );
}

function getSkillSelectorLabel(selectedSkills: string[]): string {
  if (selectedSkills.length === 0) {
    return "Select skills";
  }
  if (selectedSkills.length === 1) {
    return selectedSkills[0];
  }
  return `${selectedSkills.length} skills`;
}

interface SkillUsageTooltipProps extends TooltipContentProps<number, string> {
  displayMode: SkillUsageDisplayMode;
  skillsForChart: string[];
}

function SkillUsageTooltip({
  displayMode,
  skillsForChart,
  active,
  payload,
}: SkillUsageTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  if (!first?.payload) {
    return null;
  }

  if (!isSkillUsageChartPoint(first.payload)) {
    return null;
  }

  const point = first.payload;
  const title = point.date ?? formatShortDate(point.timestamp);
  const label = displayMode === "users" ? "users" : "executions";

  const values = skillsForChart.map((skill) => point.values[skill] ?? 0);
  const rows = skillsForChart.map((skill, idx) => ({
    label: skill,
    value: values[idx].toLocaleString(),
    colorClassName: getIndexedColor(skill, skillsForChart),
  }));

  if (skillsForChart.length > 1) {
    const total = values.reduce((sum, v) => sum + v, 0);
    rows.push({
      label: `Total ${label}`,
      value: total.toLocaleString(),
      colorClassName: "",
    });
  }

  return <ChartTooltipCard title={title} rows={rows} />;
}

interface WorkspaceSkillUsageChartProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceSkillUsageChart({
  workspaceId,
  period,
}: WorkspaceSkillUsageChartProps) {
  const [displayMode, setDisplayMode] =
    useState<SkillUsageDisplayMode>("executions");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const { skills: availableSkills, isSkillsLoading } = useWorkspaceSkills({
    workspaceId,
    days: period,
    disabled: !workspaceId,
  });

  // Auto-select first 3 skills when available skills are loaded
  useEffect(() => {
    if (availableSkills.length > 0 && selectedSkills.length === 0) {
      const initialSkills = availableSkills.slice(0, 3).map((s) => s.skillName);
      setSelectedSkills(initialSkills);
    }
  }, [availableSkills, selectedSkills.length]);

  const skillsToFetch = selectedSkills;

  const skill1Usage = useWorkspaceSkillUsage({
    workspaceId,
    days: period,
    skillName: skillsToFetch[0],
    disabled: !workspaceId || !skillsToFetch[0],
  });
  const skill2Usage = useWorkspaceSkillUsage({
    workspaceId,
    days: period,
    skillName: skillsToFetch[1],
    disabled: !workspaceId || !skillsToFetch[1],
  });
  const skill3Usage = useWorkspaceSkillUsage({
    workspaceId,
    days: period,
    skillName: skillsToFetch[2],
    disabled: !workspaceId || !skillsToFetch[2],
  });
  const skill4Usage = useWorkspaceSkillUsage({
    workspaceId,
    days: period,
    skillName: skillsToFetch[3],
    disabled: !workspaceId || !skillsToFetch[3],
  });
  const skill5Usage = useWorkspaceSkillUsage({
    workspaceId,
    days: period,
    skillName: skillsToFetch[4],
    disabled: !workspaceId || !skillsToFetch[4],
  });

  const skillUsages = useMemo(
    () => [skill1Usage, skill2Usage, skill3Usage, skill4Usage, skill5Usage],
    [skill1Usage, skill2Usage, skill3Usage, skill4Usage, skill5Usage]
  );

  // Only include skills that have loaded data to prevent chart flickering
  const skillsWithData = useMemo(() => {
    return selectedSkills.filter((skill, idx) => {
      const usage = skillUsages[idx];
      return usage && !usage.isSkillUsageLoading && !usage.isSkillUsageError;
    });
  }, [selectedSkills, skillUsages]);

  const allSkillsSettled = selectedSkills.every((_skill, idx) => {
    const usage = skillUsages[idx];
    return usage && !usage.isSkillUsageLoading;
  });

  // Show loading only on initial load, but not if all requests have settled (even with errors)
  const isLoading =
    isSkillsLoading || (skillsWithData.length === 0 && !allSkillsSettled);

  const hasError = skillUsages.some(
    (s, i) => skillsToFetch[i] && s.isSkillUsageError
  );

  const skillsForChart = skillsWithData;

  const data = useMemo((): SkillUsageChartPoint[] => {
    if (skillsWithData.length === 0) {
      return [];
    }

    const valueKey = displayMode === "users" ? "uniqueUsers" : "executionCount";

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [startDate, endDate] = getTimeRangeBounds(period, browserTimezone);
    const startTimeMs = moment.tz(startDate, browserTimezone).valueOf();
    const endTimeMs = moment.tz(endDate, browserTimezone).valueOf();
    const dayMs = 24 * 60 * 60 * 1000;
    const numDays = Math.floor((endTimeMs - startTimeMs) / dayMs) + 1;

    const points: SkillUsageChartPoint[] = [];

    for (let i = 0; i < numDays; i++) {
      const timestamp = startTimeMs + i * dayMs;
      const values: Record<string, number> = {};

      skillsWithData.forEach((skill) => {
        const idx = selectedSkills.indexOf(skill);
        const skillData = skillUsages[idx]?.skillUsage.find(
          (p) => p.timestamp === timestamp
        );
        values[skill] = skillData ? skillData[valueKey] : 0;
      });

      points.push({
        timestamp,
        date: formatShortDate(timestamp),
        values,
      });
    }

    return points;
  }, [displayMode, period, skillsWithData, selectedSkills, skillUsages]);

  const handleSkillToggle = (skill: string, checked: boolean) => {
    if (checked) {
      if (selectedSkills.length < MAX_SELECTED_SKILLS) {
        setSelectedSkills([...selectedSkills, skill]);
      }
    } else if (selectedSkills.length > 1) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    }
  };

  const legendItems: LegendItem[] = skillsForChart.map((skill) => ({
    key: skill,
    label: skill,
    colorClassName: getIndexedColor(skill, skillsForChart),
  }));

  const skillSelector = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          label={getSkillSelectorLabel(selectedSkills)}
          size="xs"
          variant="outline"
          isSelect
          disabled={isSkillsLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          Select skills (max {MAX_SELECTED_SKILLS})
        </DropdownMenuLabel>
        <div className="max-h-64 overflow-auto">
          {availableSkills.map((skill) => (
            <DropdownMenuCheckboxItem
              key={skill.skillName}
              label={skill.skillName}
              checked={selectedSkills.includes(skill.skillName)}
              disabled={
                selectedSkills.includes(skill.skillName)
                  ? selectedSkills.length <= 1
                  : selectedSkills.length >= MAX_SELECTED_SKILLS
              }
              onCheckedChange={(checked) =>
                handleSkillToggle(skill.skillName, checked)
              }
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const modeSelector = (
    <ButtonsSwitchList defaultValue={displayMode} size="xs">
      <ButtonsSwitch
        value="executions"
        label="Executions"
        onClick={() => setDisplayMode("executions")}
      />
      <ButtonsSwitch
        value="users"
        label="Users"
        onClick={() => setDisplayMode("users")}
      />
    </ButtonsSwitchList>
  );

  return (
    <ChartContainer
      title="Skill usage"
      description={`Skill usage across your workspace over the last ${period} days.`}
      isLoading={isLoading}
      errorMessage={hasError ? "Failed to load skill usage data." : undefined}
      emptyMessage={
        data.length === 0
          ? "No skill usage data for this selection."
          : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
      additionalControls={
        <div className="flex items-center gap-2">
          {skillSelector}
          {modeSelector}
        </div>
      }
    >
      <LineChart
        data={data}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
      >
        <CartesianGrid
          vertical={false}
          className="stroke-border dark:stroke-border-night"
        />
        <XAxis
          dataKey="date"
          type="category"
          scale="point"
          allowDuplicatedCategory={false}
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          allowDecimals={false}
        />
        <Tooltip
          isAnimationActive={false}
          content={(props: TooltipContentProps<number, string>) => (
            <SkillUsageTooltip
              {...props}
              displayMode={displayMode}
              skillsForChart={skillsForChart}
            />
          )}
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        {skillsForChart.map((skill) => (
          <Line
            key={skill}
            type={period === 7 || period === 14 ? "linear" : "monotone"}
            strokeWidth={2}
            dataKey={(point: SkillUsageChartPoint) => point.values[skill] ?? 0}
            name={skill}
            className={getIndexedColor(skill, skillsForChart)}
            stroke="currentColor"
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
