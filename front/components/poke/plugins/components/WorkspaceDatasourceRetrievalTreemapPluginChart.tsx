import {
  CHART_HEIGHT,
  DEFAULT_PERIOD_DAYS,
  INDEXED_COLORS,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import type { DatasourceRetrievalTreemapNode } from "@app/components/charts/DatasourceRetrievalTreemapContent";
import { DatasourceRetrievalTreemapContent } from "@app/components/charts/DatasourceRetrievalTreemapContent";
import { usePokeWorkspaceDatasourceRetrieval } from "@app/poke/swr/workspace_info";
import { useCallback, useMemo } from "react";
import { Tooltip, Treemap } from "recharts";

interface WorkspaceDatasourceRetrievalTreemapPluginChartProps {
  workspaceId: string;
  period?: number;
}

export function WorkspaceDatasourceRetrievalTreemapPluginChart({
  workspaceId,
  period = DEFAULT_PERIOD_DAYS,
}: WorkspaceDatasourceRetrievalTreemapPluginChartProps) {
  const {
    datasourceRetrieval,
    totalRetrievals,
    isDatasourceRetrievalLoading,
    isDatasourceRetrievalError,
  } = usePokeWorkspaceDatasourceRetrieval({
    workspaceId,
    days: period,
  });

  const treemapData = useMemo(() => {
    if (!datasourceRetrieval.length) {
      return null;
    }

    return datasourceRetrieval.map(
      (ds, index): DatasourceRetrievalTreemapNode => ({
        name: ds.displayName,
        dataSourceId: ds.dataSourceId,
        size: ds.count,
        color: INDEXED_COLORS[index % INDEXED_COLORS.length],
        baseColor: "sky",
        connectorProvider: ds.connectorProvider,
      })
    );
  }, [datasourceRetrieval]);

  const renderTooltip = useCallback(
    (props: { payload?: { payload?: DatasourceRetrievalTreemapNode }[] }) => {
      const data = props.payload?.[0]?.payload;
      if (!data) {
        return null;
      }

      const size = data.size ?? 0;
      const percent =
        totalRetrievals > 0 ? Math.round((size / totalRetrievals) * 100) : 0;

      return (
        <ChartTooltipCard
          title={data.name}
          rows={[{ label: "Retrievals", value: size, percent }]}
        />
      );
    },
    [totalRetrievals]
  );

  return (
    <ChartContainer
      title="Workspace datasource retrieval"
      description={`Number of documents retrieved across all agents (last ${period} days).`}
      isLoading={isDatasourceRetrievalLoading}
      errorMessage={
        isDatasourceRetrievalError
          ? "Failed to load workspace datasource retrieval data."
          : undefined
      }
      emptyMessage={
        !treemapData || treemapData.length === 0
          ? "No retrieval data for this period."
          : undefined
      }
      height={CHART_HEIGHT}
    >
      <Treemap
        data={treemapData ?? []}
        dataKey="size"
        aspectRatio={4 / 3}
        isAnimationActive={false}
        content={<DatasourceRetrievalTreemapContent />}
      >
        <Tooltip
          cursor={false}
          content={renderTooltip}
          wrapperStyle={{ outline: "none" }}
        />
      </Treemap>
    </ChartContainer>
  );
}
