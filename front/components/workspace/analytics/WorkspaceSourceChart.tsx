import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import {
  buildSourceChartData,
  getSourceColor,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useWorkspaceContextOrigin } from "@app/lib/swr/workspaces";
import { Button } from "@dust-tt/sparkle";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

interface WorkspaceSourceChartProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceSourceChart({
  workspaceId,
  period,
}: WorkspaceSourceChartProps) {
  const { hasFeature } = useFeatureFlags();
  const showExport = hasFeature("analytics_csv_export");

  const [isDownloading, setIsDownloading] = useState(false);

  const { contextOrigin, isContextOriginLoading, isContextOriginError } =
    useWorkspaceContextOrigin({
      workspaceId,
      days: period,
      disabled: !workspaceId,
    });

  const total = contextOrigin.total;
  const data = buildSourceChartData(contextOrigin.buckets, total);

  const legendItems = data.map((d) => ({
    key: d.label,
    label: d.label,
    colorClassName: getSourceColor(d.origin),
  }));

  const canDownload =
    !isContextOriginLoading && !isContextOriginError && data.length > 0;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await clientFetch(
        `/api/w/${workspaceId}/analytics/source-export?days=${period}`
      );
      if (!response.ok) {
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dust_sources_last_${period}_days.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const controls = showExport ? (
    <Button
      icon={DownloadIcon}
      variant="outline"
      size="xs"
      tooltip="Download CSV"
      onClick={handleDownload}
      disabled={!canDownload || isDownloading}
      isLoading={isDownloading}
    />
  ) : undefined;

  return (
    <ChartContainer
      title="Source"
      description={`Message volume broken down by source over the last ${period} days.`}
      isLoading={isContextOriginLoading}
      errorMessage={
        isContextOriginError ? "Failed to load source breakdown." : undefined
      }
      emptyMessage={
        data.length === 0 ? "No messages for this selection." : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
      additionalControls={controls}
    >
      <PieChart>
        <Tooltip
          isAnimationActive={false}
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
          content={({ active }) => {
            if (!active || data.length === 0) {
              return null;
            }
            const rows = data.map((d) => ({
              label: d.label,
              value: d.count.toLocaleString(),
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
