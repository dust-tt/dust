import {
  MAX_TOOLS_DISPLAYED,
  OTHER_TOOLS_LABEL,
} from "@app/components/agent_builder/observability/constants";
import type {
  ChartDatum,
  ToolChartModeType,
} from "@app/components/agent_builder/observability/types";
import { selectTopTools } from "@app/components/agent_builder/observability/utils";
import type { ToolExecutionByVersion } from "@app/lib/api/assistant/observability/tool_execution";
import type { ToolStepIndexByStep } from "@app/lib/api/assistant/observability/tool_step_index";
import {
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
  tools: Record<string, { count: number }>;
  total?: number;
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
  includeOthers: boolean
): ChartDatum[] {
  return items.map((item) => {
    const total =
      item.total ??
      Object.values(item.tools).reduce((acc, tool) => acc + tool.count, 0);

    const values: Record<string, number> = {};
    let topToolsCount = 0;
    for (const toolName of displayTools) {
      if (toolName === OTHER_TOOLS_LABEL) {
        continue;
      }

      const toolData = item.tools[toolName];
      const count = toolData?.count ?? 0;
      if (count > 0) {
        values[toolName] = calculatePercentage(count, total);
        topToolsCount += count;
      }
    }

    if (includeOthers) {
      const othersCount = total - topToolsCount;

      if (othersCount > 0) {
        values[OTHER_TOOLS_LABEL] = calculatePercentage(othersCount, total);
      }
    }

    return { label: item.label, values };
  });
}

function normalizeVersionData(data: ToolExecutionByVersion[]): ToolDataItem[] {
  return data.map((item) => ({
    label: `v${item.version}`,
    tools: item.tools,
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
  errorMessage: string | undefined
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
    ? [...selectedTools, OTHER_TOOLS_LABEL]
    : selectedTools;
  const chartData = createChartData(data, topTools, includeOthers);

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
}): ToolUsageResult {
  const { workspaceId, agentConfigurationId, period, mode } = params;

  const exec = useAgentToolExecution({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: mode !== "version",
  });
  const step = useAgentToolStepIndex({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: mode !== "step",
  });

  switch (mode) {
    case "version": {
      const rawData = exec.toolExecutionByVersion ?? [];
      const normalizedData = normalizeVersionData(rawData);
      const isLoading = exec.isToolExecutionLoading;
      const errorMessage = exec.isToolExecutionError
        ? "Failed to load tool execution data."
        : undefined;

      return processToolUsageData(
        normalizedData,
        "Version",
        "No tool execution data available for this period.",
        `Shows the relative usage frequency (%) of the top ${MAX_TOOLS_DISPLAYED} tools for each agent version.`,
        isLoading,
        errorMessage
      );
    }

    case "step": {
      const rawData = step.toolStepIndexByStep ?? [];
      const normalizedData = normalizeStepData(rawData);
      const isLoading = step.isToolStepIndexLoading;
      const errorMessage = step.isToolStepIndexError
        ? "Failed to load step index distribution."
        : undefined;

      return processToolUsageData(
        normalizedData,
        "Step",
        "No tool usage by step index for this period.",
        `Shows relative usage (%) of top ${MAX_TOOLS_DISPLAYED} tools per step index within a message.`,
        isLoading,
        errorMessage
      );
    }

    default:
      assertNever(mode);
  }
}
