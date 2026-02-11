import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";

import {
  CHART_HEIGHT,
  CONVERSATION_FILES_AGGREGATE_KEY,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import {
  getIndexedBaseColor,
  getIndexedColor,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import type { DatasourceRetrievalTreemapNode } from "@app/components/charts/DatasourceRetrievalTreemapContent";
import { DatasourceRetrievalTreemapContent } from "@app/components/charts/DatasourceRetrievalTreemapContent";
import {
  useAgentDatasourceRetrieval,
  useAgentDatasourceRetrievalDocuments,
} from "@app/lib/swr/assistants";
import type { ConnectorProvider } from "@app/types";

const DOCUMENTS_LIMIT = 200;

interface DatasourceRetrievalTreemapChartProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

type ZoomSelection = {
  mcpServerConfigIds: string[];
  mcpServerDisplayName: string;
  mcpServerName: string;
  dataSourceId: string;
  dataSourceDisplayName: string;
  connectorProvider?: ConnectorProvider;
  color: string;
  baseColor: string;
};

export function DatasourceRetrievalTreemapChart({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
}: DatasourceRetrievalTreemapChartProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const [zoomSelection, setZoomSelection] = useState<ZoomSelection | null>(
    null
  );
  const version =
    isCustomAgent && mode === "version" ? selectedVersion?.version : undefined;

  const {
    datasourceRetrieval,
    totalRetrievals,
    isDatasourceRetrievalLoading,
    isDatasourceRetrievalError,
  } = useAgentDatasourceRetrieval({
    workspaceId,
    agentConfigurationId,
    days: period,
    version,
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
          mcpServerConfigIds: mcp.mcpServerConfigIds,
          mcpServerDisplayName: mcp.mcpServerDisplayName,
          mcpServerName: mcp.mcpServerName,
          connectorProvider: datasource.connectorProvider,
        });
      }
    }

    return { treemapData: flattenedData, legendItems: legend };
  }, [datasourceRetrieval]);

  const {
    documents,
    groups,
    total: totalDocuments,
    isDatasourceRetrievalDocumentsLoading,
    isDatasourceRetrievalDocumentsError,
  } = useAgentDatasourceRetrievalDocuments({
    workspaceId,
    agentConfigurationId,
    days: period,
    version,
    mcpServerConfigIds: zoomSelection?.mcpServerConfigIds ?? null,
    mcpServerName: zoomSelection?.mcpServerName ?? null,
    dataSourceId: zoomSelection?.dataSourceId ?? null,
    limit: DOCUMENTS_LIMIT,
    disabled: !zoomSelection,
  });

  const zoomTreemapData = useMemo(() => {
    if (!zoomSelection) {
      return null;
    }

    // For Slack, only show channel-level blocks (no individual threads).
    const isSlack =
      zoomSelection.connectorProvider === "slack" ||
      zoomSelection.connectorProvider === "slack_bot";

    const documentsByParentId = new Map<string | null, typeof documents>();
    documents.forEach((d) => {
      const key = d.parentId ?? null;
      const bucket = documentsByParentId.get(key);
      if (bucket) {
        bucket.push(d);
      } else {
        documentsByParentId.set(key, [d]);
      }
    });

    return groups.map((g) => ({
      name: g.displayName,
      parentId: g.parentId,
      size: g.count,
      color: zoomSelection.color,
      baseColor: zoomSelection.baseColor,
      children: isSlack
        ? undefined
        : (documentsByParentId.get(g.parentId) ?? []).map((d) => ({
            name: d.displayName,
            documentId: d.documentId,
            parentId: d.parentId,
            sourceUrl: d.sourceUrl,
            size: d.count,
            color: zoomSelection.color,
            baseColor: zoomSelection.baseColor,
          })),
    }));
  }, [documents, groups, zoomSelection]);

  const handleDatasourceClick = useCallback(
    (node: DatasourceRetrievalTreemapNode) => {
      const hasConfigIds =
        node.mcpServerConfigIds && node.mcpServerConfigIds.length > 0;
      // Need either config IDs or server name (for servers like data_sources_file_system).
      // Skip aggregated conversation files — no document drill-down available.
      if (
        (!hasConfigIds && !node.mcpServerName) ||
        !node.mcpServerDisplayName ||
        !node.dataSourceId ||
        node.dataSourceId === CONVERSATION_FILES_AGGREGATE_KEY
      ) {
        return;
      }

      setZoomSelection({
        mcpServerConfigIds: node.mcpServerConfigIds ?? [],
        mcpServerDisplayName: node.mcpServerDisplayName,
        mcpServerName: node.mcpServerName ?? "",
        dataSourceId: node.dataSourceId,
        dataSourceDisplayName: node.name,
        connectorProvider: node.connectorProvider,
        color: node.color,
        baseColor: node.baseColor,
      });
    },
    []
  );

  const handleDocumentClick = (node: DatasourceRetrievalTreemapNode) => {
    if (node.sourceUrl) {
      window.open(node.sourceUrl, "_blank");
    }
  };

  const makeTooltipRenderer = useCallback(
    (total: number) =>
      (props: { payload?: { payload?: DatasourceRetrievalTreemapNode }[] }) => {
        const data = props.payload?.[0]?.payload;
        if (!data) {
          return null;
        }

        const size = data.size ?? 0;
        const percent = total > 0 ? Math.round((size / total) * 100) : 0;

        return (
          <ChartTooltipCard
            title={data.name}
            rows={[{ label: "Retrievals", value: size, percent }]}
          />
        );
      },
    []
  );

  const renderDatasourceTooltip = useMemo(
    () => makeTooltipRenderer(totalRetrievals),
    [makeTooltipRenderer, totalRetrievals]
  );

  const renderDocumentsTooltip = useMemo(
    () => makeTooltipRenderer(totalDocuments),
    [makeTooltipRenderer, totalDocuments]
  );

  const isDialogOpen = zoomSelection !== null;
  let dialogBody: JSX.Element | null = null;

  if (isDialogOpen) {
    if (isDatasourceRetrievalDocumentsLoading) {
      dialogBody = (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      );
    } else if (isDatasourceRetrievalDocumentsError) {
      dialogBody = (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground dark:text-muted-foreground-night">
          Failed to load document breakdown.
        </div>
      );
    } else if (!zoomTreemapData || zoomTreemapData.length === 0) {
      dialogBody = (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground dark:text-muted-foreground-night">
          No document data for this selection.
        </div>
      );
    } else {
      dialogBody = (
        <div className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={zoomTreemapData}
              dataKey="size"
              aspectRatio={4 / 3}
              isAnimationActive={false}
              content={
                <DatasourceRetrievalTreemapContent
                  onNodeClick={handleDocumentClick}
                />
              }
            >
              <Tooltip
                cursor={false}
                content={renderDocumentsTooltip}
                wrapperStyle={{ outline: "none" }}
              />
            </Treemap>
          </ResponsiveContainer>
        </div>
      );
    }
  }

  return (
    <>
      <ChartContainer
        title="Documents retrieved by data sources"
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
        <Treemap
          data={treemapData ?? []}
          dataKey="size"
          aspectRatio={4 / 3}
          isAnimationActive={false}
          content={
            <DatasourceRetrievalTreemapContent
              onNodeClick={handleDatasourceClick}
            />
          }
        >
          <Tooltip
            cursor={false}
            content={renderDatasourceTooltip}
            wrapperStyle={{ outline: "none" }}
          />
        </Treemap>
      </ChartContainer>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => !open && setZoomSelection(null)}
      >
        <DialogContent size="2xl" height="2xl">
          <DialogHeader>
            <DialogTitle>
              {zoomSelection
                ? `Documents retrieved: ${zoomSelection.dataSourceDisplayName}`
                : ""}
            </DialogTitle>
            {zoomSelection && (
              <DialogDescription>
                Top documents retrieved from{" "}
                {zoomSelection.dataSourceDisplayName} via{" "}
                {zoomSelection.mcpServerDisplayName}, grouped by parent.
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogContainer className="h-full w-full">
            {dialogBody}
          </DialogContainer>
        </DialogContent>
      </Dialog>
    </>
  );
}
