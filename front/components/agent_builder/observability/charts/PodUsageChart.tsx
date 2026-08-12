import {
  OTHER_LABEL,
  UNKNOWN_LABEL,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { CHART_HEIGHT } from "@app/components/charts/constants";
import { useSelectableSeries } from "@app/components/charts/useSelectableSeries";
import { useAgentPodUsage } from "@app/lib/swr/assistants";
import { isString } from "@app/types/shared/utils/general";
import { cn } from "@dust-tt/sparkle";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

const NO_POD_KEY = "__no_pod__";
const NO_POD_LABEL = "No pod";

// Pods beyond this count are grouped under a single "Others" slice to keep the
// donut and legend readable on workspaces with many pods.
const MAX_PODS_DISPLAYED = 20;

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

  const toPercent = (count: number) =>
    total > 0 ? Math.round((count / total) * 100) : 0;

  // Buckets come sorted by count descending, with the no-pod bucket last.
  const podBuckets = podUsage.buckets.filter((b) => b.podId !== null);
  const noPodBucket = podUsage.buckets.find((b) => b.podId === null);

  const topPods: PodChartDatum[] = podBuckets
    .slice(0, MAX_PODS_DISPLAYED)
    .map((bucket) => ({
      key: bucket.podId ?? NO_POD_KEY,
      label: bucket.name ?? NO_POD_LABEL,
      count: bucket.count,
      percent: toPercent(bucket.count),
    }));

  // Pods beyond the displayed top N, plus messages the backend aggregation
  // truncated past its own bucket cap (otherPodsCount).
  const othersCount =
    podBuckets
      .slice(MAX_PODS_DISPLAYED)
      .reduce((acc, bucket) => acc + bucket.count, 0) + podUsage.otherPodsCount;

  const data: PodChartDatum[] = [
    ...topPods,
    ...(othersCount > 0
      ? [
          {
            key: OTHER_LABEL.key,
            label: OTHER_LABEL.label,
            count: othersCount,
            percent: toPercent(othersCount),
          },
        ]
      : []),
    ...(noPodBucket
      ? [
          {
            key: NO_POD_KEY,
            label: NO_POD_LABEL,
            count: noPodBucket.count,
            percent: toPercent(noPodBucket.count),
          },
        ]
      : []),
  ];

  const podKeys = topPods.map((d) => d.label);

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
