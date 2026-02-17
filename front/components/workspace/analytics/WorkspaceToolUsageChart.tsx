import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  CHART_HEIGHT,
  INDEXED_COLORS,
} from "@app/components/agent_builder/observability/constants";
import { getTimeRangeBounds } from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import {
  useWorkspaceTools,
  useWorkspaceToolUsage,
} from "@app/lib/swr/workspaces";
import { formatShortDate } from "@app/lib/utils/timestamps";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";
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
    return "Select tools";
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

  const values = toolsForChart.map((tool) => point.values[tool] ?? 0);
  const rows = toolsForChart.map((tool, idx) => ({
    label: asDisplayToolName(tool),
    value: values[idx].toLocaleString(),
    colorClassName: getToolColor(tool, toolsForChart),
  }));

  if (toolsForChart.length > 1) {
    const total = values.reduce((sum, v) => sum + v, 0);
    rows.push({
      label: `Total ${label}`,
      value: total.toLocaleString(),
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

  // Auto-select first 3 tools when available tools are loaded
  useEffect(() => {
    if (availableTools.length > 0 && selectedTools.length === 0) {
      const initialTools = availableTools.slice(0, 3).map((t) => t.serverName);
      setSelectedTools(initialTools);
    }
  }, [availableTools, selectedTools.length]);

  const toolsToFetch = selectedTools;

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

  // Only include tools that have loaded data to prevent chart flickering
  const toolsWithData = useMemo(() => {
    return selectedTools.filter((tool, idx) => {
      const usage = toolUsages[idx];
      // Tool has data if it's not loading and has no error
      return usage && !usage.isToolUsageLoading && !usage.isToolUsageError;
    });
  }, [selectedTools, toolUsages]);

  // Show loading only on initial load (when no tools have data yet)
  const isLoading = isToolsLoading || toolsWithData.length === 0;

  const hasError = toolUsages.some(
    (t, i) => toolsToFetch[i] && t.isToolUsageError
  );

  const toolsForChart = toolsWithData;

  const data = useMemo((): ToolUsageChartPoint[] => {
    if (toolsWithData.length === 0) {
      return [];
    }

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

      toolsWithData.forEach((tool) => {
        const idx = selectedTools.indexOf(tool);
        const toolData = toolUsages[idx]?.toolUsage.find(
          (p) => p.timestamp === timestamp
        );
        values[tool] = toolData ? toolData[valueKey] : 0;
      });

      points.push({
        timestamp,
        date: formatShortDate(timestamp),
        values,
      });
    }

    return points;
  }, [displayMode, period, toolsWithData, selectedTools, toolUsages]);

  const handleToolToggle = (tool: string, checked: boolean) => {
    if (checked) {
      if (selectedTools.length < MAX_SELECTED_TOOLS) {
        setSelectedTools([...selectedTools, tool]);
      }
    } else {
      setSelectedTools(selectedTools.filter((t) => t !== tool));
    }
  };

  const legendItems: LegendItem[] = toolsForChart.map((tool) => ({
    key: tool,
    label: asDisplayToolName(tool),
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
      description={`Tool usage across your workspace over the last ${period} days.`}
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
          isAnimationActive={false}
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
            name={asDisplayToolName(tool)}
            className={getToolColor(tool, toolsForChart)}
            stroke="currentColor"
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
