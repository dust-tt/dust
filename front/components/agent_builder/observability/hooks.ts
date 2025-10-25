import {
  MAX_TOOLS_DISPLAYED,
  PERCENTAGE_MULTIPLIER,
} from "@app/components/agent_builder/observability/constants";
import type {
  ChartDatum,
  Mode,
} from "@app/components/agent_builder/observability/types";
import { computeTopToolsFromCounts } from "@app/components/agent_builder/observability/utils";
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
  return Math.round((count / total) * PERCENTAGE_MULTIPLIER);
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
  topTools: string[]
): ChartDatum[] {
  return items.map((item) => {
    const total =
      item.total ??
      Object.values(item.tools).reduce((acc, tool) => acc + tool.count, 0);

    const values: Record<string, number> = {};
    for (const toolName of topTools) {
      const toolData = item.tools[toolName];
      const count = toolData?.count ?? 0;
      values[toolName] = calculatePercentage(count, total);
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
  const topTools = computeTopToolsFromCounts(counts, MAX_TOOLS_DISPLAYED);
  const chartData = createChartData(data, topTools);

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
  mode: Mode;
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
