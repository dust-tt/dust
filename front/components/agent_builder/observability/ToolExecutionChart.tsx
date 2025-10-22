import { useCallback, useMemo } from "react";
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
import { useAgentToolExecution } from "@app/lib/swr/assistants";

type ChartRow = { version: string; values: Record<string, number> };

type BarShapeProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  payload: ChartRow;
};

function isTopForPayloadFactory(topTools: string[]) {
  return (payload: ChartRow, seriesIdx: number) => {
    for (let k = seriesIdx + 1; k < topTools.length; k++) {
      const nextTool = topTools[k];
      if ((payload.values[nextTool] ?? 0) > 0) {
        return false;
      }
    }
    return true;
  };
}

type IsTopForPayload = (payload: ChartRow, seriesIdx: number) => boolean;

type RoundedTopBarShapeProps = Partial<BarShapeProps> & {
  isTopForPayload: IsTopForPayload;
  seriesIdx: number;
};

function RoundedTopBarShape(props: RoundedTopBarShapeProps): JSX.Element {
  const { x, y, width, height, fill, payload, isTopForPayload, seriesIdx } =
    props;

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

interface ToolExecutionChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

function ToolExecutionTooltip({
  active,
  payload,
  label,
  topTools,
}: TooltipContentProps<number, string> & { topTools: string[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const rows = payload
    .filter((p) => typeof p.value === "number" && p.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((p) => ({
      label: p.name || "",
      value: `${p.value}%`,
      colorClassName: getToolColor(p.name || "", topTools),
    }));

  return <ChartTooltipCard title={String(label)} rows={rows} />;
}

export function ToolExecutionChart({
  workspaceId,
  agentConfigurationId,
}: ToolExecutionChartProps) {
  const { period } = useObservability();
  const {
    toolExecutionByVersion,
    isToolExecutionLoading,
    isToolExecutionError,
  } = useAgentToolExecution({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId,
  });

  const { chartData, topTools } = useMemo(() => {
    if (!toolExecutionByVersion || toolExecutionByVersion.length === 0) {
      return { chartData: [], topTools: [] };
    }

    // Aggregate total counts per tool across all versions
    const toolTotalCounts = new Map<string, number>();
    for (const v of toolExecutionByVersion) {
      for (const [toolName, toolData] of Object.entries(v.tools)) {
        toolTotalCounts.set(
          toolName,
          (toolTotalCounts.get(toolName) ?? 0) + toolData.count
        );
      }
    }

    // Top tools by total usage
    const top = Array.from(toolTotalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOOLS_DISPLAYED)
      .map(([toolName]) => toolName);

    // Build rows with numeric series for tools
    const rows: ChartRow[] = toolExecutionByVersion.map((v) => {
      const versionTotal = Object.values(v.tools).reduce(
        (acc, t) => acc + t.count,
        0
      );

      const toolValues: Record<string, number> = {};
      for (const toolName of top) {
        const t = v.tools[toolName];
        toolValues[toolName] = t
          ? versionTotal > 0
            ? Math.round((t.count / versionTotal) * PERCENTAGE_MULTIPLIER)
            : 0
          : 0;
      }

      return { version: `v${v.version}`, values: toolValues };
    });

    return { chartData: rows, topTools: top };
  }, [toolExecutionByVersion]);

  const renderTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <ToolExecutionTooltip {...props} topTools={topTools} />
    ),
    [topTools]
  );

  const legendItems = topTools.map((toolName) => ({
    key: toolName,
    label: toolName,
    colorClassName: getToolColor(toolName, topTools),
  }));

  // Factory used by the shape to decide when to round
  const isTopForPayload = useMemo(
    () => isTopForPayloadFactory(topTools),
    [topTools]
  );

  return (
    <ChartContainer
      title="Tool Usage by Version"
      isLoading={isToolExecutionLoading}
      errorMessage={
        isToolExecutionError ? "Failed to load tool execution data." : undefined
      }
      emptyMessage={
        chartData.length === 0
          ? "No tool execution data available for this period."
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis
            dataKey="version"
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
              dataKey={(row: ChartRow) => row.values[toolName] ?? 0}
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
        <p>
          Shows the relative usage frequency (%) of the top{" "}
          {MAX_TOOLS_DISPLAYED} tools for each agent version. Higher percentages
          indicate more frequent tool usage within that version.
        </p>
      </div>
    </ChartContainer>
  );
}
