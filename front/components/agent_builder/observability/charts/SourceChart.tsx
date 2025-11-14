import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { useAgentContextOrigin } from "@app/lib/swr/assistants";

type SourceDatum = {
  origin: string;
  count: number;
  percent: number;
};

const SOURCE_COLORS = [
  "text-pink-300 dark:text-pink-300-night",
  "text-blue-400 dark:text-blue-400-night",
  "text-rose-400 dark:text-rose-400-night",
  "text-amber-400 dark:text-amber-400-night",
  "text-violet-300 dark:text-violet-300-night",
  "text-slate-300 dark:text-slate-300-night",
] as const;

function getSourceColor(index: number) {
  return SOURCE_COLORS[index % SOURCE_COLORS.length];
}

export function SourceChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { period, mode, selectedVersion } = useObservabilityContext();

  const { contextOrigin, isContextOriginLoading, isContextOriginError } =
    useAgentContextOrigin({
      workspaceId,
      agentConfigurationId,
      days: period,
      version: mode === "version" ? selectedVersion?.version : undefined,
      disabled:
        !workspaceId ||
        !agentConfigurationId ||
        (mode === "version" && !selectedVersion),
    });

  const total = contextOrigin.total ?? 0;

  const data: SourceDatum[] =
    total === 0
      ? []
      : contextOrigin.buckets.map((b) => ({
          origin: b.origin,
          count: b.count,
          percent: Math.round((b.count / total) * 100),
        }));

  const legendItems = data.map((d, index) => ({
    key: d.origin,
    label: d.origin,
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
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) {
                return null;
              }
              const p = payload[0].payload as SourceDatum;
              return (
                <ChartTooltipCard
                  title={p.origin}
                  rows={[
                    { label: "Messages", value: p.count },
                    { label: "Share", value: `${p.percent}%` },
                  ]}
                />
              );
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
