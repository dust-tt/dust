import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import {
  buildSourceChartData,
  getSourceColor,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { useAgentContextOrigin } from "@app/lib/swr/assistants";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

interface SourceChartProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function SourceChart({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
}: SourceChartProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();

  const { contextOrigin, isContextOriginLoading, isContextOriginError } =
    useAgentContextOrigin({
      workspaceId,
      agentConfigurationId,
      days: period,
      version:
        isCustomAgent && mode === "version" && selectedVersion
          ? selectedVersion.version
          : undefined,
      disabled:
        !workspaceId ||
        !agentConfigurationId ||
        (isCustomAgent && mode === "version" && !selectedVersion),
    });

  const total = contextOrigin.total;

  const data = buildSourceChartData(contextOrigin.buckets, total);

  const legendItems = data.map((d) => ({
    key: d.label,
    label: d.label,
    colorClassName: getSourceColor(d.origin),
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
      height={CHART_HEIGHT}
      legendItems={legendItems}
    >
      <PieChart>
        <Tooltip
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
          content={({ active }) => {
            if (!active || data.length === 0) {
              return null;
            }
            const rows = data.map((d) => ({
              label: d.label,
              value: d.count,
              percent: d.percent,
              colorClassName: getSourceColor(d.origin),
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
          minAngle={4}
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((entry) => (
            <Cell
              key={entry.origin}
              className={getSourceColor(entry.origin)}
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
            <tspan className="text-2xl font-semibold">
              {total.toLocaleString()}
            </tspan>
            <tspan x="50%" dy="1.2em" className="text-sm">
              Messages
            </tspan>
          </text>
        )}
      </PieChart>
    </ChartContainer>
  );
}
