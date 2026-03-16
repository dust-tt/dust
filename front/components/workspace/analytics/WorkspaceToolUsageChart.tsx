import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import {
  getDayTimestamps,
  getIndexedColor,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
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
import { DownloadIcon } from "lucide-react";
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
  toolsWithData: string[];
}

function ToolUsageTooltip({
  displayMode,
  toolsWithData,
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

  const values = toolsWithData.map((tool) => point.values[tool] ?? 0);
  const rows = toolsWithData.map((tool, idx) => ({
    label: asDisplayToolName(tool),
    value: values[idx].toLocaleString(),
    colorClassName: getIndexedColor(tool, toolsWithData),
  }));

  if (toolsWithData.length > 1) {
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
  const { hasFeature } = useFeatureFlags();
  const showExport = hasFeature("analytics_csv_export");
  const [isDownloading, setIsDownloading] = useState(false);

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

  const tool1Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: selectedTools[0],
    disabled: !workspaceId || !selectedTools[0],
  });
  const tool2Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: selectedTools[1],
    disabled: !workspaceId || !selectedTools[1],
  });
  const tool3Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: selectedTools[2],
    disabled: !workspaceId || !selectedTools[2],
  });
  const tool4Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: selectedTools[3],
    disabled: !workspaceId || !selectedTools[3],
  });
  const tool5Usage = useWorkspaceToolUsage({
    workspaceId,
    days: period,
    serverName: selectedTools[4],
    disabled: !workspaceId || !selectedTools[4],
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
    (t, i) => selectedTools[i] && t.isToolUsageError
  );

  const data = useMemo((): ToolUsageChartPoint[] => {
    if (toolsWithData.length === 0) {
      return [];
    }

    const valueKey = displayMode === "users" ? "uniqueUsers" : "executionCount";

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dayTimestamps = getDayTimestamps(period, browserTimezone);

    const points: ToolUsageChartPoint[] = [];

    for (const timestamp of dayTimestamps) {
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

  const legendItems: LegendItem[] = toolsWithData.map((tool) => ({
    key: tool,
    label: asDisplayToolName(tool),
    colorClassName: getIndexedColor(tool, toolsWithData),
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

  const canDownload = !isToolsLoading && !hasError && data.length > 0;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await clientFetch(
        `/api/w/${workspaceId}/analytics/tool-usage-export?days=${period}`
      );
      if (!response.ok) {
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dust_tool_usage_last_${period}_days.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadButton = showExport ? (
    <Button
      icon={DownloadIcon}
      variant="outline"
      size="xs"
      tooltip="Download CSV"
      onClick={handleDownload}
      disabled={!canDownload || isDownloading}
      isLoading={isDownloading}
    />
  ) : undefined;

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
          {downloadButton}
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
              toolsWithData={toolsWithData}
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
        {toolsWithData.map((tool) => (
          <Line
            key={tool}
            type={period === 7 || period === 14 ? "linear" : "monotone"}
            strokeWidth={2}
            dataKey={(point: ToolUsageChartPoint) => point.values[tool] ?? 0}
            name={asDisplayToolName(tool)}
            className={getIndexedColor(tool, toolsWithData)}
            stroke="currentColor"
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
