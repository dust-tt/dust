import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  CHART_HEIGHT,
  INDEXED_COLORS,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import type { LegendItem } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { getTimeRangeBounds } from "@app/components/agent_builder/observability/utils";
import {
  useWorkspaceTools,
  useWorkspaceToolUsage,
} from "@app/lib/swr/workspaces";
import { formatShortDate } from "@app/lib/utils/timestamps";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";

type ToolUsageDisplayMode = "users" | "executions";

const MAX_SELECTED_TOOLS = 5;

interface ToolUsageChartPoint {
  timestamp: number;
  date: string;
  values: Record<string, number>;
}

function getToolColor(toolName: string, allTools: string[]): string {
  const idx = allTools.indexOf(toolName);
  return INDEXED_COLORS[(idx >= 0 ? idx : 0) % INDEXED_COLORS.length];
}

function getToolSelectorLabel(selectedTools: string[]): string {
  if (selectedTools.length === 0) {
    return "All tools";
  }
  if (selectedTools.length === 1) {
    return asDisplayToolName(selectedTools[0]);
  }
  return `${selectedTools.length} tools`;
}

interface ToolUsageTooltipProps extends TooltipContentProps<number, string> {
  displayMode: ToolUsageDisplayMode;
  toolsForChart: string[];
}

function ToolUsageTooltip({
  displayMode,
  toolsForChart,
  active,
  payload,
}: ToolUsageTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  if (!first?.payload) {
    return null;
  }

  const point = first.payload as ToolUsageChartPoint;
  const title = point.date ?? formatShortDate(point.timestamp);
  const label = displayMode === "users" ? "users" : "executions";

  const rows = toolsForChart.map((tool) => ({
    label: tool === "all_tools" ? "All tools" : asDisplayToolName(tool),
    value: point.values[tool] ?? 0,
    colorClassName: getToolColor(tool, toolsForChart),
  }));

  if (toolsForChart.length > 1) {
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    rows.push({
      label: `Total ${label}`,
      value: total,
      colorClassName: "",
    });
  }

  return <ChartTooltipCard title={title} rows={rows} />;
}

interface WorkspaceToolUsageChartProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceToolUsageChart({
  workspaceId,
  period,
}: WorkspaceToolUsageChartProps) {
  const [displayMode, setDisplayMode] =
    useState<ToolUsageDisplayMode>("executions");
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  const { tools: availableTools, isToolsLoading } = useWorkspaceTools({
    workspaceId,
    days: period,
    disabled: !workspaceId,
  });

  const toolsToFetch = selectedTools.length > 0 ? selectedTools : [];

  const { toolUsage: allToolsUsage, isToolUsageLoading: isAllToolsLoading } =
    useWorkspaceToolUsage({
      workspaceId,
      days: period,
      disabled: !workspaceId || selectedTools.length > 0,
    });

  const tool1Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: toolsToFetch[0],
    disabled: !workspaceId || !toolsToFetch[0],
  });
  const tool2Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: toolsToFetch[1],
    disabled: !workspaceId || !toolsToFetch[1],
  });
  const tool3Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: toolsToFetch[2],
    disabled: !workspaceId || !toolsToFetch[2],
  });
  const tool4Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: toolsToFetch[3],
    disabled: !workspaceId || !toolsToFetch[3],
  });
  const tool5Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: toolsToFetch[4],
    disabled: !workspaceId || !toolsToFetch[4],
  });

  const toolUsages = useMemo(
    () => [tool1Usage, tool2Usage, tool3Usage, tool4Usage, tool5Usage],
    [tool1Usage, tool2Usage, tool3Usage, tool4Usage, tool5Usage]
  );

  const isLoading =
    isToolsLoading ||
    (selectedTools.length === 0 && isAllToolsLoading) ||
    toolUsages.some((t, i) => toolsToFetch[i] && t.isToolUsageLoading);

  const hasError = toolUsages.some(
    (t, i) => toolsToFetch[i] && t.isToolUsageError
  );

  const toolsForChart =
    selectedTools.length > 0 ? selectedTools : ["all_tools"];

  const data = useMemo((): ToolUsageChartPoint[] => {
    const valueKey = displayMode === "users" ? "uniqueUsers" : "executionCount";

    const [startDate, endDate] = getTimeRangeBounds(period);
    const startTime = new Date(startDate + "T00:00:00Z").getTime();
    const endTime = new Date(endDate + "T00:00:00Z").getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const numDays = Math.floor((endTime - startTime) / dayMs) + 1;

    const points: ToolUsageChartPoint[] = [];

    for (let i = 0; i < numDays; i++) {
      const timestamp = startTime + i * dayMs;
      const values: Record<string, number> = {};

      if (selectedTools.length === 0) {
        const allData = allToolsUsage.find((p) => p.timestamp === timestamp);
        values["all_tools"] = allData ? allData[valueKey] : 0;
      } else {
        selectedTools.forEach((tool, idx) => {
          const toolData = toolUsages[idx]?.toolUsage.find(
            (p) => p.timestamp === timestamp
          );
          values[tool] = toolData ? toolData[valueKey] : 0;
        });
      }

      points.push({
        timestamp,
        date: formatShortDate(timestamp),
        values,
      });
    }

    return points;
  }, [displayMode, period, selectedTools, allToolsUsage, toolUsages]);

  const handleToolToggle = (tool: string, checked: boolean) => {
    if (checked) {
      if (selectedTools.length < MAX_SELECTED_TOOLS) {
        setSelectedTools([...selectedTools, tool]);
      }
    } else {
      setSelectedTools(selectedTools.filter((t) => t !== tool));
    }
  };

  const handleSelectAll = () => {
    setSelectedTools([]);
  };

  const legendItems: LegendItem[] = toolsForChart.map((tool) => ({
    key: tool,
    label: tool === "all_tools" ? "All tools" : asDisplayToolName(tool),
    colorClassName: getToolColor(tool, toolsForChart),
  }));

  const toolSelector = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          label={getToolSelectorLabel(selectedTools)}
          size="xs"
          variant="outline"
          isSelect
          disabled={isToolsLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem label="All tools" onClick={handleSelectAll} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          Select tools (max {MAX_SELECTED_TOOLS})
        </DropdownMenuLabel>
        <div className="max-h-64 overflow-auto">
          {availableTools.map((tool) => (
            <DropdownMenuCheckboxItem
              key={tool.serverName}
              label={asDisplayToolName(tool.serverName)}
              checked={selectedTools.includes(tool.serverName)}
              disabled={
                !selectedTools.includes(tool.serverName) &&
                selectedTools.length >= MAX_SELECTED_TOOLS
              }
              onCheckedChange={(checked) =>
                handleToolToggle(tool.serverName, checked)
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
      title="Tool usage"
      description="Track how tools are being used across your workspace."
      isLoading={isLoading}
      errorMessage={hasError ? "Failed to load tool usage data." : undefined}
      emptyMessage={
        data.length === 0 ? "No tool usage data for this selection." : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
      additionalControls={
        <div className="flex items-center gap-2">
          {toolSelector}
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
          content={(props: TooltipContentProps<number, string>) => (
            <ToolUsageTooltip
              {...props}
              displayMode={displayMode}
              toolsForChart={toolsForChart}
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
        {toolsForChart.map((tool) => (
          <Line
            key={tool}
            type={period === 7 || period === 14 ? "linear" : "monotone"}
            strokeWidth={2}
            dataKey={(point: ToolUsageChartPoint) => point.values[tool] ?? 0}
            name={tool === "all_tools" ? "All tools" : asDisplayToolName(tool)}
            className={getToolColor(tool, toolsForChart)}
            stroke="currentColor"
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
