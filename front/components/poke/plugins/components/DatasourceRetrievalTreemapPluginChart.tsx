import { useCallback, useMemo } from "react";
import { Tooltip, Treemap } from "recharts";

import {
  CHART_HEIGHT,
  DEFAULT_PERIOD_DAYS,
} from "@app/components/agent_builder/observability/constants";
import {
  getIndexedBaseColor,
  getIndexedColor,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import type { DatasourceRetrievalTreemapNode } from "@app/components/charts/DatasourceRetrievalTreemapContent";
import { DatasourceRetrievalTreemapContent } from "@app/components/charts/DatasourceRetrievalTreemapContent";
import { usePokeAgentDatasourceRetrieval } from "@app/poke/swr/agent_details";

interface DatasourceRetrievalTreemapPluginChartProps {
  workspaceId: string;
  agentConfigurationId: string;
  period?: number;
}

export function DatasourceRetrievalTreemapPluginChart({
  workspaceId,
  agentConfigurationId,
  period = DEFAULT_PERIOD_DAYS,
}: DatasourceRetrievalTreemapPluginChartProps) {
  const {
    datasourceRetrieval,
    totalRetrievals,
    isDatasourceRetrievalLoading,
    isDatasourceRetrievalError,
  } = usePokeAgentDatasourceRetrieval({
    workspaceId,
    agentConfigurationId,
    days: period,
  });

  const { treemapData, legendItems } = useMemo(() => {
    if (!datasourceRetrieval.length) {
      return { treemapData: null, legendItems: [] };
    }

    const toolKeys = datasourceRetrieval.map((mcp) => mcp.mcpServerDisplayName);
    const flattenedData: DatasourceRetrievalTreemapNode[] = [];
    const legend: Array<{
      key: string;
      label: string;
      colorClassName: string;
    }> = [];
    const seenServers = new Set<string>();

    for (const mcp of datasourceRetrieval) {
      const serverColor = getIndexedColor(mcp.mcpServerDisplayName, toolKeys);
      const serverBaseColor = getIndexedBaseColor(
        mcp.mcpServerDisplayName,
        toolKeys
      );

      if (!seenServers.has(mcp.mcpServerDisplayName)) {
        legend.push({
          key: mcp.mcpServerDisplayName,
          label: mcp.mcpServerDisplayName,
          colorClassName: serverColor,
        });
        seenServers.add(mcp.mcpServerDisplayName);
      }

      for (const datasource of mcp.datasources) {
        flattenedData.push({
          name: datasource.displayName,
          dataSourceId: datasource.dataSourceId,
          size: datasource.count,
          color: serverColor,
          baseColor: serverBaseColor,
          mcpServerDisplayName: mcp.mcpServerDisplayName,
        });
      }
    }

    return { treemapData: flattenedData, legendItems: legend };
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
      title="Documents retrieved by data sources"
      description={`Number of documents retrieved per searches, grouped by datasource (last ${period} days).`}
      isLoading={isDatasourceRetrievalLoading}
      errorMessage={
        isDatasourceRetrievalError
          ? "Failed to load datasource retrieval data."
          : undefined
      }
      emptyMessage={
        !treemapData || treemapData.length === 0
          ? "No retrieval data for this period."
          : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
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
