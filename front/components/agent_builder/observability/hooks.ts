import {
  MAX_TOOLS_DISPLAYED,
  OTHER_TOOLS_LABEL,
} from "@app/components/agent_builder/observability/constants";
import type { ObservabilityMode } from "@app/components/agent_builder/observability/ObservabilityContext";
import type {
  ChartDatum,
  ToolChartModeType,
} from "@app/components/agent_builder/observability/types";
import { selectTopTools } from "@app/components/agent_builder/observability/utils";
import type { ToolExecutionByVersion } from "@app/lib/api/assistant/observability/tool_execution";
import type { ToolStepIndexByStep } from "@app/lib/api/assistant/observability/tool_step_index";
import {
  useAgentErrorRate,
  useAgentLatency,
  useAgentToolExecution,
  useAgentToolStepIndex,
} from "@app/lib/swr/assistants";
import { formatShortDate } from "@app/lib/utils/timestamps";
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

type ErrorRateDataResult = {
  data: {
    timestamp: number;
    date: string;
    total: number;
    failed: number;
    errorRate: number;
  }[];
  isLoading: boolean;
  errorMessage: string | undefined;
};

type LatencyDataResult = {
  data: {
    timestamp: number;
    date: string;
    messages: number;
    average: number;
  }[];
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
  filterVersion?: string | null;
}): ToolUsageResult {
  const { workspaceId, agentConfigurationId, period, mode, filterVersion } =
    params;

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

export function useErrorRateData(params: {
  workspaceId: string;
  agentConfigurationId: string;
  period: number;
  mode: ObservabilityMode;
  filterVersion?: string | null;
}): ErrorRateDataResult {
  const { workspaceId, agentConfigurationId, period, mode, filterVersion } =
    params;

  const { errorRate, isErrorRateLoading, isErrorRateError } = useAgentErrorRate(
    {
      workspaceId,
      agentConfigurationId,
      days: period,
      version: mode === "version" ? filterVersion ?? undefined : undefined,
      disabled: !workspaceId || !agentConfigurationId,
    }
  );

  return {
    data: errorRate.map((item) => ({
      ...item,
      date: formatShortDate(item.timestamp),
    })),
    isLoading: isErrorRateLoading,
    errorMessage: isErrorRateError
      ? "Failed to load error rate data."
      : undefined,
  };
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
    version: mode === "version" ? filterVersion ?? undefined : undefined,
    disabled: !workspaceId || !agentConfigurationId,
  });

  return {
    data: latency.map((item) => ({
      ...item,
      date: formatShortDate(item.timestamp),
    })),
    isLoading: isLatencyLoading,
    errorMessage: isLatencyError ? "Failed to load latency data." : undefined,
  };
}
