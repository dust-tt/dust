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
import { isMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  useAgentConfiguration,
  useAgentDatasourceRetrieval,
} from "@app/lib/swr/assistants";
import { asDisplayName, isConnectorProvider } from "@app/types";

interface TreemapNode {
  name: string;
  size: number;
  color: string;

  [key: string]: string | number;
}

function getDisplayNameForDataSourceName(dataSourceName: string): string {
  if (dataSourceName.startsWith("managed-")) {
    const parts = dataSourceName.slice("managed-".length).split("-");
    const provider = parts[0];

    if (isConnectorProvider(provider)) {
      return CONNECTOR_CONFIGURATIONS[provider].name;
    }
  }
  return dataSourceName;
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
  const shouldShowText = width > 50 && height > 30;

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
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 8}
            textAnchor="middle"
            className="pointer-events-none truncate text-ellipsis fill-foreground text-xs font-medium dark:fill-foreground-night"
          >
            {name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 8}
            textAnchor="middle"
            className="pointer-events-none fill-muted-foreground text-xs dark:fill-muted-foreground-night"
          >
            {value}
          </text>
        </>
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

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId,
    agentConfigurationId,
  });

  const mcpConfigNameMap = useMemo(() => {
    const map = new Map<string, string>();

    if (!agentConfiguration) {
      return map;
    }

    agentConfiguration.actions.forEach((action) => {
      if (isMCPServerConfiguration(action) && action.name) {
        map.set(action.id.toString(), asDisplayName(action.name));
      }
    });
    return map;
  }, [agentConfiguration]);

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
        mcpConfigNameMap.get(mcp.mcpServerConfigId.toString()) ??
        mcp.mcpServerName;

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
          name: getDisplayNameForDataSourceName(ds.name),
          size: ds.count,
          color: serverColor,
        });
      });
    });

    return { treemapData: flattenedData, legendItems: legend };
  }, [datasourceRetrieval, mcpConfigNameMap]);

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
