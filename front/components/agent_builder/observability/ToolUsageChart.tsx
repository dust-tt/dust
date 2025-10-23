import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import { SliderToggle } from "@dust-tt/sparkle";

import { ChartContainer } from "@app/components/agent_builder/observability/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/ChartTooltip";
import {
  CHART_HEIGHT,
  MAX_TOOLS_DISPLAYED,
  PERCENTAGE_MULTIPLIER,
} from "@app/components/agent_builder/observability/constants";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { getToolColor } from "@app/components/agent_builder/observability/utils";
import {
  useAgentToolExecution,
  useAgentToolStepIndex,
} from "@app/lib/swr/assistants";

type Mode = "version" | "step";

type VersionChartRow = { version: string; values: Record<string, number> };
type StepChartRow = { step: number; values: Record<string, number> };

type IsTopForPayload = (
  payload: VersionChartRow | StepChartRow,
  seriesIdx: number
) => boolean;

function isTopForPayloadFactory(topTools: string[]) {
  return (payload: VersionChartRow | StepChartRow, seriesIdx: number) => {
    for (let k = seriesIdx + 1; k < topTools.length; k++) {
      const nextTool = topTools[k];
      if ((payload.values[nextTool] ?? 0) > 0) {
        return false;
      }
    }
    return true;
  };
}

function RoundedTopBarShape({
  x,
  y,
  width,
  height,
  fill,
  payload,
  isTopForPayload,
  seriesIdx,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: VersionChartRow | StepChartRow;
  isTopForPayload: IsTopForPayload;
  seriesIdx: number;
}): JSX.Element {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !payload
  ) {
    return <g />;
  }
  const r = 4;
  if (!isTopForPayload(payload, seriesIdx)) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }
  const right = x + width;
  const bottom = y + height;
  const d = `M ${x} ${bottom} L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} L ${right - r} ${y} A ${r} ${r} 0 0 1 ${right} ${y + r} L ${right} ${bottom} Z`;
  return <path d={d} fill={fill} />;
}

export function ToolUsageChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { period } = useObservability();
  const [mode, setMode] = useState<Mode>("version");

  // Fetch per selected mode only
  const {
    toolExecutionByVersion,
    isToolExecutionLoading,
    isToolExecutionError,
  } = useAgentToolExecution({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId || mode !== "version",
  });

  const { toolStepIndexByStep, isToolStepIndexLoading, isToolStepIndexError } =
    useAgentToolStepIndex({
      workspaceId,
      agentConfigurationId,
      days: period,
      disabled: !workspaceId || !agentConfigurationId || mode !== "step",
    });

  const isLoading =
    mode === "version" ? isToolExecutionLoading : isToolStepIndexLoading;
  const errorMessage =
    mode === "version"
      ? isToolExecutionError
        ? "Failed to load tool execution data."
        : undefined
      : isToolStepIndexError
        ? "Failed to load step index distribution."
        : undefined;

  const {
    chartData,
    topTools,
    xDataKey,
    xAxisLabel,
    tooltipTitleFormatter,
    emptyMessage,
    legendDescription,
  } = useMemo(() => {
    if (mode === "version") {
      if (!toolExecutionByVersion || toolExecutionByVersion.length === 0) {
        return {
          chartData: [] as VersionChartRow[],
          topTools: [] as string[],
          xDataKey: "version" as const,
          xAxisLabel: "Version",
          tooltipTitleFormatter: (l: string | number) => String(l),
          emptyMessage: "No tool execution data available for this period.",
          legendDescription: `Shows the relative usage frequency (%) of the top ${MAX_TOOLS_DISPLAYED} tools for each agent version.`,
        };
      }
      const aggregate = new Map<string, number>();
      for (const v of toolExecutionByVersion) {
        for (const [toolName, toolData] of Object.entries(v.tools)) {
          aggregate.set(
            toolName,
            (aggregate.get(toolName) ?? 0) + toolData.count
          );
        }
      }
      const top = Array.from(aggregate.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOOLS_DISPLAYED)
        .map(([name]) => name);
      const rows: VersionChartRow[] = toolExecutionByVersion.map((v) => {
        const versionTotal = Object.values(v.tools).reduce(
          (acc, t) => acc + t.count,
          0
        );
        const values: Record<string, number> = {};
        for (const t of top) {
          const td = v.tools[t];
          values[t] = td
            ? versionTotal > 0
              ? Math.round((td.count / versionTotal) * PERCENTAGE_MULTIPLIER)
              : 0
            : 0;
        }
        return { version: `v${v.version}`, values };
      });
      return {
        chartData: rows,
        topTools: top,
        xDataKey: "version" as const,
        xAxisLabel: "Version",
        tooltipTitleFormatter: (l: string | number) => String(l),
        emptyMessage: "No tool execution data available for this period.",
        legendDescription: `Shows the relative usage frequency (%) of the top ${MAX_TOOLS_DISPLAYED} tools for each agent version.`,
      };
    } else {
      if (!toolStepIndexByStep || toolStepIndexByStep.length === 0) {
        return {
          chartData: [] as StepChartRow[],
          topTools: [] as string[],
          xDataKey: "step" as const,
          xAxisLabel: "Step",
          tooltipTitleFormatter: (l: string | number) => `Step ${String(l)}`,
          emptyMessage: "No tool usage by step index for this period.",
          legendDescription: `Shows relative usage (%) of top ${MAX_TOOLS_DISPLAYED} tools per step index within a message.`,
        };
      }
      const aggregate = new Map<string, number>();
      for (const s of toolStepIndexByStep) {
        for (const [toolName, toolData] of Object.entries(s.tools)) {
          aggregate.set(
            toolName,
            (aggregate.get(toolName) ?? 0) + toolData.count
          );
        }
      }
      const top = Array.from(aggregate.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOOLS_DISPLAYED)
        .map(([name]) => name);
      const rows: StepChartRow[] = toolStepIndexByStep.map((s) => {
        const stepTotal = s.total > 0 ? s.total : 0;
        const values: Record<string, number> = {};
        for (const t of top) {
          const td = s.tools[t];
          values[t] = td
            ? stepTotal > 0
              ? Math.round((td.count / stepTotal) * PERCENTAGE_MULTIPLIER)
              : 0
            : 0;
        }
        return { step: s.step, values };
      });
      return {
        chartData: rows,
        topTools: top,
        xDataKey: "step" as const,
        xAxisLabel: "Step",
        tooltipTitleFormatter: (l: string | number) => `Step ${String(l)}`,
        emptyMessage: "No tool usage by step index for this period.",
        legendDescription: `Shows relative usage (%) of top ${MAX_TOOLS_DISPLAYED} tools per step index within a message.`,
      };
    }
  }, [mode, toolExecutionByVersion, toolStepIndexByStep]);

  const renderTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => {
      const { active, payload, label } = props;
      if (!active || !payload || payload.length === 0) return null;
      const rows = payload
        .filter((p) => typeof p.value === "number" && p.value > 0)
        .sort((a, b) => (b.value as number) - (a.value as number))
        .map((p) => ({
          label: p.name || "",
          value: `${p.value}%`,
          colorClassName: getToolColor(p.name || "", topTools),
        }));
      return (
        <ChartTooltipCard
          title={tooltipTitleFormatter(label ?? "")}
          rows={rows}
        />
      );
    },
    [topTools, tooltipTitleFormatter]
  );

  const legendItems = topTools.map((toolName) => ({
    key: toolName,
    label: toolName,
    colorClassName: getToolColor(toolName, topTools),
  }));

  const isTopForPayload = useMemo(
    () => isTopForPayloadFactory(topTools),
    [topTools]
  );

  const additionalControls = (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">By Version</span>
      <SliderToggle
        size="xs"
        selected={mode === "step"}
        onClick={() => setMode(mode === "version" ? "step" : "version")}
      />
      <span className="text-xs text-muted-foreground">By Step</span>
    </div>
  );

  return (
    <ChartContainer
      title="Tool Usage"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={chartData.length === 0 ? emptyMessage : undefined}
      additionalControls={additionalControls}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={chartData as any}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis
            dataKey={xDataKey as any}
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            label={{
              value: "Usage %",
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            cursor={false}
            content={renderTooltip}
            wrapperStyle={{ outline: "none" }}
            contentStyle={{
              background: "transparent",
              border: "none",
              padding: 0,
              boxShadow: "none",
            }}
          />
          {topTools.map((toolName, idx) => (
            <Bar
              key={toolName}
              dataKey={(row: VersionChartRow | StepChartRow) =>
                row.values[toolName] ?? 0
              }
              stackId="a"
              fill="currentColor"
              className={getToolColor(toolName, topTools)}
              name={toolName}
              shape={
                <RoundedTopBarShape
                  seriesIdx={idx}
                  isTopForPayload={isTopForPayload}
                />
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
      <div className="mt-4 text-xs text-muted-foreground">
        <p>{legendDescription}</p>
      </div>
    </ChartContainer>
  );
}
