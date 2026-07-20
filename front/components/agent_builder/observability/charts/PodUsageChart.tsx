import {
  CHART_HEIGHT,
  UNKNOWN_LABEL,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { useSelectableSeries } from "@app/components/charts/useSelectableSeries";
import { useAgentPodUsage } from "@app/lib/swr/assistants";
import { isString } from "@app/types/shared/utils/general";
import { cn } from "@dust-tt/sparkle";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

const NO_POD_KEY = "__no_pod__";
const NO_POD_LABEL = "No pod";

type PodChartDatum = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

interface PodUsageChartProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function PodUsageChart({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
}: PodUsageChartProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();

  const { podUsage, isPodUsageLoading, isPodUsageError } = useAgentPodUsage({
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

  const total = podUsage.total;

  const data: PodChartDatum[] = podUsage.buckets.map((bucket) => ({
    key: bucket.podId ?? NO_POD_KEY,
    label: bucket.name ?? NO_POD_LABEL,
    count: bucket.count,
    percent: total > 0 ? Math.round((bucket.count / total) * 100) : 0,
  }));

  const podKeys = data.filter((d) => d.key !== NO_POD_KEY).map((d) => d.label);

  const getPodColor = (datum: PodChartDatum) =>
    datum.key === NO_POD_KEY
      ? UNKNOWN_LABEL.color
      : getIndexedColor(datum.label, podKeys);

  const { selectedKey, isDimmed, decorate } = useSelectableSeries();

  const legendItems = decorate(
    data.map((d) => ({
      key: d.key,
      label: d.label,
      colorClassName: getPodColor(d),
    }))
  );

  return (
    <ChartContainer
      title="Pods"
      description="Message volume broken down by pod."
      isLoading={isPodUsageLoading}
      errorMessage={
        isPodUsageError ? "Failed to load pod usage breakdown." : undefined
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
          content={({ active, payload }) => {
            if (!active || data.length === 0) {
              return null;
            }
            const rawKey = payload?.[0]?.payload?.key;
            const hoveredKey = isString(rawKey) ? rawKey : undefined;
            const rows = data.map((d) => ({
              key: d.key,
              label: d.label,
              value: d.count,
              percent: d.percent,
              colorClassName: getPodColor(d),
            }));
            return (
              <ChartTooltipCard
                title="Pod breakdown"
                rows={rows}
                activeKey={hoveredKey ?? selectedKey}
                selectedKey={selectedKey}
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
          nameKey="key"
          innerRadius="60%"
          outerRadius="80%"
          minAngle={4}
          paddingAngle={3}
          strokeWidth={0}
          isAnimationActive={false}
        >
          {data.map((entry) => (
            <Cell
              key={entry.key}
              className={cn(
                getPodColor(entry),
                "transition-opacity",
                isDimmed(entry.key) && "opacity-25"
              )}
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
            className="fill-foreground"
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
