import {
  MAX_TOOLS_DISPLAYED,
  OTHER_LABEL,
} from "@app/components/agent_builder/observability/constants";
import type { ObservabilityMode } from "@app/components/agent_builder/observability/ObservabilityContext";
import type {
  ChartDatum,
  ToolChartModeType,
  ToolChartUsageDatum,
} from "@app/components/agent_builder/observability/types";
import { selectTopTools } from "@app/components/agent_builder/observability/utils";
import type { ToolExecutionByVersion } from "@app/lib/api/assistant/observability/tool_execution";
import type { ToolStepIndexByStep } from "@app/lib/api/assistant/observability/tool_step_index";
import {
  useAgentLatency,
  useAgentToolExecution,
  useAgentToolStepIndex,
} from "@app/lib/swr/assistants";
import { assertNever } from "@app/types/shared/utils/assert_never";

type ToolUsageResult = {
  chartData: ChartDatum[];
  topTools: string[];
  xAxisLabel: string;
  emptyMessage: string;
  legendDescription: string;
  isLoading: boolean;
  errorMessage: string | undefined;
};

type ToolDataItem = {
  label: string | number;
  tools: Record<
    string,
    {
      count: number;
      breakdown?: Record<string, number>;
    }
  >;
  total?: number;
};

export type LatencyPoint = {
  timestamp: number;
  count: number;
  avgLatencyMs: number;
  percentilesLatencyMs: number;
};

type LatencyDataResult = {
  data: LatencyPoint[];
  isLoading: boolean;
  errorMessage: string | undefined;
};

function calculatePercentage(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((count / total) * 100);
}

function aggregateToolCounts(items: ToolDataItem[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of items) {
    for (const [toolName, toolData] of Object.entries(item.tools)) {
      const currentCount = counts.get(toolName) ?? 0;
      counts.set(toolName, currentCount + toolData.count);
    }
  }

  return counts;
}

function createChartData(
  items: ToolDataItem[],
  displayTools: string[],
  includeOthers: boolean,
  configurationNames?: Map<string, string>
): ChartDatum[] {
  const topToolSet = new Set(
    displayTools.filter((toolName) => toolName !== OTHER_LABEL.label)
  );

  return items.map((item) => {
    const total =
      item.total ??
      Object.values(item.tools).reduce((acc, tool) => acc + tool.count, 0);

    const values: Record<string, ToolChartUsageDatum> = {};
    let topToolsCount = 0;
    for (const toolName of topToolSet) {
      const toolData = item.tools[toolName];
      const count = toolData?.count ?? 0;
      if (count > 0) {
        const breakdownEntries = toolData.breakdown
          ? Object.entries(toolData.breakdown)
          : [];

        values[toolName] = {
          percent: calculatePercentage(count, total),
          count,
          breakdown:
            breakdownEntries.length > 0
              ? breakdownEntries.map(([sid, breakdownCount]) => ({
                  label: configurationNames?.get(sid) ?? toolName,
                  count: breakdownCount,
                  percent: calculatePercentage(breakdownCount, count),
                }))
              : undefined,
        };
        topToolsCount += count;
      }
    }

    if (includeOthers) {
      const othersCount = total - topToolsCount;

      if (othersCount > 0) {
        const othersBreakdownEntries = Object.entries(item.tools).filter(
          ([toolName, toolData]) =>
            !topToolSet.has(toolName) && (toolData?.count ?? 0) > 0
        );

        const othersBreakdown =
          othersBreakdownEntries.length > 0
            ? othersBreakdownEntries.map(([toolName, toolData]) => ({
                label: toolName,
                count: toolData.count,
                percent: calculatePercentage(toolData.count, othersCount),
              }))
            : undefined;

        values[OTHER_LABEL.label] = {
          percent: calculatePercentage(othersCount, total),
          count: othersCount,
          breakdown: othersBreakdown,
        };
      }
    }

    return { label: item.label, values, total };
  });
}

function normalizeVersionData(data: ToolExecutionByVersion[]): ToolDataItem[] {
  return data.map((item) => ({
    label: `v${item.version}`,
    tools: Object.fromEntries(
      Object.entries(item.tools).map(([toolName, metrics]) => [
        toolName,
        {
          count: metrics.count,
          breakdown: metrics.mcpViewBreakdown,
        },
      ])
    ),
  }));
}

function normalizeStepData(data: ToolStepIndexByStep[]): ToolDataItem[] {
  return data.map((item) => ({
    label: item.step,
    tools: item.tools,
    total: item.total,
  }));
}

function createEmptyResult(
  xAxisLabel: string,
  emptyMessage: string,
  legendDescription: string,
  isLoading: boolean,
  errorMessage: string | undefined
): ToolUsageResult {
  return {
    chartData: [],
    topTools: [],
    xAxisLabel,
    emptyMessage,
    legendDescription,
    isLoading,
    errorMessage,
  };
}

function processToolUsageData(
  data: ToolDataItem[],
  xAxisLabel: string,
  emptyMessage: string,
  legendDescription: string,
  isLoading: boolean,
  errorMessage: string | undefined,
  configurationNames?: Map<string, string>
): ToolUsageResult {
  if (data.length === 0) {
    return createEmptyResult(
      xAxisLabel,
      emptyMessage,
      legendDescription,
      isLoading,
      errorMessage
    );
  }

  const counts = aggregateToolCounts(data);
  const selectedTools = selectTopTools(counts, MAX_TOOLS_DISPLAYED);
  const includeOthers = counts.size > MAX_TOOLS_DISPLAYED;
  const topTools = includeOthers
    ? [...selectedTools, OTHER_LABEL.label]
    : selectedTools;
  const chartData = createChartData(
    data,
    topTools,
    includeOthers,
    configurationNames
  );

  return {
    chartData,
    topTools,
    xAxisLabel,
    emptyMessage,
    legendDescription,
    isLoading,
    errorMessage,
  };
}

export function useToolUsageData(params: {
  workspaceId: string;
  agentConfigurationId: string;
  period: number;
  mode: ToolChartModeType;
  filterVersion?: string | null;
  configurationNames?: Map<string, string>;
}): ToolUsageResult {
  const {
    workspaceId,
    agentConfigurationId,
    period,
    mode,
    filterVersion,
    configurationNames,
  } = params;

  const exec = useAgentToolExecution({
    workspaceId,
    agentConfigurationId,
    days: period,
    version: filterVersion ?? undefined,
    disabled: mode !== "version",
  });
  const step = useAgentToolStepIndex({
    workspaceId,
    agentConfigurationId,
    days: period,
    version: filterVersion ?? undefined,
    disabled: mode !== "step",
  });

  switch (mode) {
    case "version": {
      const rawData = exec.toolExecutionByVersion;
      let normalizedData = normalizeVersionData(rawData);
      if (filterVersion) {
        const vv = `v${filterVersion}`;
        normalizedData = normalizedData.filter((d) => d.label === vv);
      }
      const isLoading = exec.isToolExecutionLoading;
      const errorMessage = exec.isToolExecutionError
        ? "Failed to load tool execution data."
        : undefined;

      return processToolUsageData(
        normalizedData,
        "Version",
        filterVersion
          ? "No tool execution data for the selected version."
          : "No tool execution data available for this period.",
        `Usage frequency of tools for each agent version.`,
        isLoading,
        errorMessage,
        configurationNames
      );
    }

    case "step": {
      const rawData = step.toolStepIndexByStep ?? [];
      const normalizedData = normalizeStepData(rawData);
      const isLoading = step.isToolStepIndexLoading;
      const errorMessage = step.isToolStepIndexError
        ? "Failed to load step distribution."
        : undefined;

      return processToolUsageData(
        normalizedData,
        "Step",
        "No tool usage by step for this period.",
        `Usage tools per step within a message.`,
        isLoading,
        errorMessage,
        configurationNames
      );
    }

    default:
      assertNever(mode);
  }
}

export function useLatencyData(params: {
  workspaceId: string;
  agentConfigurationId: string;
  period: number;
  mode: ObservabilityMode;
  filterVersion?: string | null;
}): LatencyDataResult {
  const { workspaceId, agentConfigurationId, period, mode, filterVersion } =
    params;

  const { latency, isLatencyLoading, isLatencyError } = useAgentLatency({
    workspaceId,
    agentConfigurationId,
    days: period,
    version: mode === "version" ? (filterVersion ?? undefined) : undefined,
    disabled: !workspaceId || !agentConfigurationId,
  });

  return {
    data: latency,
    isLoading: isLatencyLoading,
    errorMessage: isLatencyError ? "Failed to load latency data." : undefined,
  };
}
