import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import {
  CHART_HEIGHT,
  getSourceColor,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { useAgentContextOrigin } from "@app/lib/swr/assistants";
import {
  isUserMessageOrigin,
  USER_MESSAGE_ORIGIN_LABELS,
} from "@app/types/assistant/conversation";

interface SourceChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

export function SourceChart({
  workspaceId,
  agentConfigurationId,
}: SourceChartProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();

  const { contextOrigin, isContextOriginLoading, isContextOriginError } =
    useAgentContextOrigin({
      workspaceId,
      agentConfigurationId,
      days: period,
      version: selectedVersion?.version,
      disabled:
        !agentConfigurationId || (mode === "version" && !selectedVersion),
    });

  const total = contextOrigin.total;

  const data = contextOrigin.buckets.map((b) => {
    const label = isUserMessageOrigin(b.origin)
      ? USER_MESSAGE_ORIGIN_LABELS[b.origin]
      : b.origin;
    return {
      origin: b.origin,
      label,
      count: b.count,
      percent: Math.round((b.count / total) * 100),
    };
  });

  const legendItems = data.map((d, index) => ({
    key: d.origin,
    label: d.label,
    colorClassName: getSourceColor(index),
  }));

  return (
    <ChartContainer
      title="Source"
      description="Message volume broken down by source."
      isLoading={isContextOriginLoading}
      errorMessage={
        isContextOriginError ? "Failed to load source breakdown." : undefined
      }
      emptyMessage={
        data.length === 0 ? "No messages for this selection." : undefined
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <PieChart>
          <Tooltip
            cursor={false}
            wrapperStyle={{ outline: "none" }}
            content={({ active }) => {
              if (!active || data.length === 0) {
                return null;
              }
              const rows = data.map((d, index) => ({
                label: d.label,
                value: d.count,
                percent: d.percent,
                colorClassName: getSourceColor(index),
              }));

              return <ChartTooltipCard title="Source breakdown" rows={rows} />;
            }}
            contentStyle={{
              background: "transparent",
              border: "none",
              padding: 0,
              boxShadow: "none",
            }}
          />
          <Pie
            data={data}
            dataKey="count"
            nameKey="origin"
            innerRadius="60%"
            outerRadius="80%"
            paddingAngle={3}
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.origin}
                className={getSourceColor(index)}
                fill="currentColor"
              />
            ))}
          </Pie>
          {/* Center label */}
          {total > 0 && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground dark:fill-foreground-night"
            >
              <tspan className="text-2xl font-semibold">{total}</tspan>
              <tspan x="50%" dy="1.2em" className="text-sm">
                Messages
              </tspan>
            </text>
          )}
        </PieChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
    </ChartContainer>
  );
}
