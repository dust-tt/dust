import {
  MAX_TOOLS_DISPLAYED,
  PERCENTAGE_MULTIPLIER,
} from "@app/components/agent_builder/observability/constants";
import { computeTopToolsFromCounts } from "@app/components/agent_builder/observability/utils";
import {
  useAgentToolExecution,
  useAgentToolStepIndex,
} from "@app/lib/swr/assistants";
import type { ChartDatum, Mode } from "./types";

export function useToolUsageData(params: {
  workspaceId: string;
  agentConfigurationId: string;
  period: number;
  mode: Mode;
}) {
  const { workspaceId, agentConfigurationId, period, mode } = params;

  const exec = useAgentToolExecution({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId || mode !== "version",
  });
  const step = useAgentToolStepIndex({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId || mode !== "step",
  });

  const isLoading =
    mode === "version"
      ? exec.isToolExecutionLoading
      : step.isToolStepIndexLoading;
  const errorMessage =
    mode === "version"
      ? exec.isToolExecutionError
        ? "Failed to load tool execution data."
        : undefined
      : step.isToolStepIndexError
        ? "Failed to load step index distribution."
        : undefined;

  if (mode === "version") {
    const data = exec.toolExecutionByVersion ?? [];
    if (data.length === 0) {
      return {
        chartData: [] as ChartDatum[],
        topTools: [] as string[],
        xAxisLabel: "Version",
        emptyMessage: "No tool execution data available for this period.",
        legendDescription: `Shows the relative usage frequency (%) of the top ${MAX_TOOLS_DISPLAYED} tools for each agent version.`,
        isLoading,
        errorMessage,
      };
    }
    const counts = new Map<string, number>();
    for (const v of data) {
      for (const [toolName, toolData] of Object.entries(v.tools)) {
        counts.set(toolName, (counts.get(toolName) ?? 0) + toolData.count);
      }
    }
    const topTools = computeTopToolsFromCounts(counts, MAX_TOOLS_DISPLAYED);
    const chartData: ChartDatum[] = data.map((v) => {
      const total = Object.values(v.tools).reduce((acc, t) => acc + t.count, 0);
      const values: Record<string, number> = {};
      for (const t of topTools) {
        const td = v.tools[t];
        values[t] = td
          ? total > 0
            ? Math.round((td.count / total) * PERCENTAGE_MULTIPLIER)
            : 0
          : 0;
      }
      return { label: `v${v.version}`, values };
    });
    return {
      chartData,
      topTools,
      xAxisLabel: "Version",
      emptyMessage: "No tool execution data available for this period.",
      legendDescription: `Shows the relative usage frequency (%) of the top ${MAX_TOOLS_DISPLAYED} tools for each agent version.`,
      isLoading,
      errorMessage,
    };
  } else {
    const data = step.toolStepIndexByStep ?? [];
    if (data.length === 0) {
      return {
        chartData: [] as ChartDatum[],
        topTools: [] as string[],
        xAxisLabel: "Step",
        emptyMessage: "No tool usage by step index for this period.",
        legendDescription: `Shows relative usage (%) of top ${MAX_TOOLS_DISPLAYED} tools per step index within a message.`,
        isLoading,
        errorMessage,
      };
    }
    const counts = new Map<string, number>();
    for (const s of data) {
      for (const [toolName, toolData] of Object.entries(s.tools)) {
        counts.set(toolName, (counts.get(toolName) ?? 0) + toolData.count);
      }
    }
    const topTools = computeTopToolsFromCounts(counts, MAX_TOOLS_DISPLAYED);
    const chartData: ChartDatum[] = data.map((s) => {
      const total = s.total > 0 ? s.total : 0;
      const values: Record<string, number> = {};
      for (const t of topTools) {
        const td = s.tools[t];
        values[t] = td
          ? total > 0
            ? Math.round((td.count / total) * PERCENTAGE_MULTIPLIER)
            : 0
          : 0;
      }
      return { label: s.step, values };
    });
    return {
      chartData,
      topTools,
      xAxisLabel: "Step",
      emptyMessage: "No tool usage by step index for this period.",
      legendDescription: `Shows relative usage (%) of top ${MAX_TOOLS_DISPLAYED} tools per step index within a message.`,
      isLoading,
      errorMessage,
    };
  }
}
