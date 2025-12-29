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
import {
  useAgentConfiguration,
  useAgentDatasourceRetrieval,
} from "@app/lib/swr/assistants";

interface TreemapNode {
  name: string;
  size: number;
  color: string;
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

function CustomizedContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name = "",
  value = 0,
  depth = 0,
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
            className="pointer-events-none fill-foreground text-xs font-medium dark:fill-foreground-night"
          >
            {name.length > 20 ? `${name.slice(0, 17)}...` : name}
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

export function DatasourceRetrievalTreemapChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
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
    if (!agentConfiguration) {
      return new Map<string, string>();
    }
    console.log(">>>>> agentConfiguration.actions", agentConfiguration.actions);
    const map = new Map<string, string>();
    agentConfiguration.actions.forEach((action) => {
      if (action.type === "mcp_server_configuration" && action.name) {
        console.log(
          `>>>>> Mapping action ID ${action.id} -> name "${action.name}"`
        );
        map.set(action.id.toString(), action.name);
      }
    });
    console.log(">>>>> mcpConfigNameMap", map);
    return map;
  }, [agentConfiguration]);

  const { treemapData, legendItems } = useMemo(() => {
    if (!datasourceRetrieval.length) {
      return { treemapData: null, legendItems: [] };
    }

    console.log(">>>>> datasourceRetrieval", datasourceRetrieval);
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

      console.log(
        `>>>>> Matching mcpServerConfigId "${mcp.mcpServerConfigId}" -> displayName "${displayName}" (found in map: ${mcpConfigNameMap.has(mcp.mcpServerConfigId)})`
      );

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
          name: ds.name,
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
      title="MCP Servers"
      description="Number of documents retrieved per MCP server, grouped by datasource."
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
          content={<CustomizedContent />}
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
