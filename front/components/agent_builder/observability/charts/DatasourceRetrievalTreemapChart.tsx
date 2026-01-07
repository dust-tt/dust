import { useCallback, useMemo } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";

import {
  CHART_HEIGHT,
  INDEXED_COLORS,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";
import { useAgentDatasourceRetrieval } from "@app/lib/swr/assistants";
import { asDisplayName } from "@app/types";

interface TreemapNode {
  name: string;
  size: number;
  color: string;

  [key: string]: string | number;
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  value?: number;
  depth?: number;
  color?: string;
}

function TreemapContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name = "",
  value = 0,
  color = INDEXED_COLORS[0],
}: TreemapContentProps) {
  const shouldShowText = width > 0 && height > 0;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="currentColor"
        className={color}
        stroke="white"
        strokeWidth={2}
      />
      {shouldShowText && (
        <foreignObject
          x={x}
          y={y}
          width={width}
          height={height}
          pointerEvents="none"
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden p-1 text-center">
            <div className="w-full truncate text-ellipsis text-xs font-medium text-foreground dark:text-foreground-night">
              {name}
            </div>
            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              {value}
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

interface DatasourceRetrievalTreemapChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

export function DatasourceRetrievalTreemapChart({
  workspaceId,
  agentConfigurationId,
}: DatasourceRetrievalTreemapChartProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();

  const {
    datasourceRetrieval,
    totalRetrievals,
    isDatasourceRetrievalLoading,
    isDatasourceRetrievalError,
  } = useAgentDatasourceRetrieval({
    workspaceId,
    agentConfigurationId,
    days: period,
    version: mode === "version" ? selectedVersion?.version : undefined,
  });

  const { treemapData, legendItems } = useMemo(() => {
    if (!datasourceRetrieval.length) {
      return { treemapData: null, legendItems: [] };
    }

    const mcpServerConfigIds = datasourceRetrieval.map(
      (mcp) => mcp.mcpServerConfigId
    );
    const flattenedData: TreemapNode[] = [];
    const legend: Array<{
      key: string;
      label: string;
      colorClassName: string;
    }> = [];
    const seenServers = new Set<string>();

    datasourceRetrieval.forEach((mcp) => {
      const serverColor = getIndexedColor(
        mcp.mcpServerConfigId,
        mcpServerConfigIds
      );
      const displayName =
        asDisplayName(mcp.mcpServerConfigName) || mcp.mcpServerName;

      if (!seenServers.has(mcp.mcpServerConfigId)) {
        legend.push({
          key: mcp.mcpServerConfigId,
          label: displayName,
          colorClassName: serverColor,
        });
        seenServers.add(mcp.mcpServerConfigId);
      }

      mcp.datasources.forEach((ds) => {
        flattenedData.push({
          name: ds.displayName,
          size: ds.count,
          color: serverColor,
        });
      });
    });

    return { treemapData: flattenedData, legendItems: legend };
  }, [datasourceRetrieval]);

  const renderTooltip = useCallback(
    (props: { payload?: { payload?: TreemapNode }[] }) => {
      const { payload } = props;
      if (!payload || !payload[0]) {
        return null;
      }

      const data = payload[0].payload;
      if (!data) {
        return null;
      }

      const size = data.size ?? 0;
      const percent =
        totalRetrievals > 0 ? Math.round((size / totalRetrievals) * 100) : 0;

      return (
        <ChartTooltipCard
          title={data.name}
          rows={[
            {
              label: "Retrievals",
              value: size,
              percent,
            },
          ]}
        />
      );
    },
    [totalRetrievals]
  );

  return (
    <ChartContainer
      title="Documents retrieved by data sources (BETA)"
      description="Number of documents retrieved per searches, grouped by datasource."
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
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <Treemap
          data={treemapData ?? []}
          dataKey="size"
          aspectRatio={4 / 3}
          isAnimationActive={false}
          content={<TreemapContent />}
        >
          <Tooltip
            cursor={false}
            content={renderTooltip}
            wrapperStyle={{ outline: "none" }}
          />
        </Treemap>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
