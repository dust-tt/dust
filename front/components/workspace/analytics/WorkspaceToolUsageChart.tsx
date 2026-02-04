import {
  Button,
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

interface ToolUsagePoint {
  timestamp: number;
  date: string;
  [key: string]: number | string; // Dynamic keys for each tool
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

function getDataKeySuffix(displayMode: ToolUsageDisplayMode): string {
  return displayMode === "users" ? "_users" : "_executions";
}

interface ToolUsageTooltipProps extends TooltipContentProps<number, string> {
  displayMode: ToolUsageDisplayMode;
  selectedTools: string[];
}

function ToolUsageTooltip({
  displayMode,
  selectedTools,
  ...props
}: ToolUsageTooltipProps) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  if (!first?.payload) {
    return null;
  }

  const row = first.payload as ToolUsagePoint;
  const title = row.date ?? formatShortDate(row.timestamp);

  const suffix = getDataKeySuffix(displayMode);
  const label = displayMode === "users" ? "users" : "executions";

  const rows = selectedTools.map((tool) => ({
    label: asDisplayToolName(tool),
    value: row[`${tool}${suffix}`] ?? 0,
    colorClassName: getToolColor(tool, selectedTools),
  }));

  // Add total if multiple tools
  if (selectedTools.length > 1) {
    const total = rows.reduce(
      (sum, r) => sum + (typeof r.value === "number" ? r.value : 0),
      0
    );
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

  // Fetch list of available tools for dropdown
  const { tools: availableTools, isToolsLoading } = useWorkspaceTools({
    workspaceId,
    days: period,
    disabled: !workspaceId,
  });

  // Fetch data for all tools (when no selection) or each selected tool
  const toolsToFetch = selectedTools.length > 0 ? selectedTools : [];

  // Fetch aggregated data when no specific tools are selected
  const { toolUsage: allToolsUsage, isToolUsageLoading: isAllToolsLoading } =
    useWorkspaceToolUsage({
      workspaceId,
      days: period,
      disabled: !workspaceId || selectedTools.length > 0,
    });

  // Fetch data for each selected tool
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

  const toolUsages = [
    tool1Usage,
    tool2Usage,
    tool3Usage,
    tool4Usage,
    tool5Usage,
  ];

  const isLoading =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    isToolsLoading ||
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    (selectedTools.length === 0 && isAllToolsLoading) ||
    toolUsages.some((t, i) => toolsToFetch[i] && t.isToolUsageLoading);

  const hasError = toolUsages.some(
    (t, i) => toolsToFetch[i] && t.isToolUsageError
  );

  // Merge data from all selected tools into a single dataset
  const data = useMemo(() => {
    const suffix = getDataKeySuffix(displayMode);
    const valueKey = displayMode === "users" ? "uniqueUsers" : "executionCount";

    // Generate all dates in the range
    const [startDate, endDate] = getTimeRangeBounds(period);
    const startTime = new Date(startDate + "T00:00:00Z").getTime();
    const endTime = new Date(endDate + "T00:00:00Z").getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const numDays = Math.floor((endTime - startTime) / dayMs) + 1;

    const points: ToolUsagePoint[] = [];

    for (let i = 0; i < numDays; i++) {
      const timestamp = startTime + i * dayMs;
      const point: ToolUsagePoint = {
        timestamp,
        date: formatShortDate(timestamp),
      };

      if (selectedTools.length === 0) {
        // Show aggregated "all tools" data
        const allData = allToolsUsage.find((p) => p.timestamp === timestamp);
        point["all_tools" + suffix] = allData ? allData[valueKey] : 0;
      } else {
        // Show data for each selected tool
        selectedTools.forEach((tool, idx) => {
          const toolData = toolUsages[idx]?.toolUsage.find(
            (p) => p.timestamp === timestamp
          );
          point[`${tool}${suffix}`] = toolData ? toolData[valueKey] : 0;
        });
      }

      points.push(point);
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

  const suffix = getDataKeySuffix(displayMode);
  const toolsForChart =
    selectedTools.length > 0 ? selectedTools : ["all_tools"];

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={displayMode === "users" ? "Unique users" : "Executions"}
          size="xs"
          variant="outline"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          label="Executions"
          onClick={() => setDisplayMode("executions")}
        />
        <DropdownMenuItem
          label="Unique users"
          onClick={() => setDisplayMode("users")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
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
              selectedTools={toolsForChart}
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
            dataKey={`${tool}${suffix}`}
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
