import {
  cn,
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
  buildColorClass,
  CHART_HEIGHT,
  INDEXED_COLORS,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import {
  getIndexedBaseColor,
  getIndexedColor,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import {
  useAgentDatasourceRetrieval,
  useAgentDatasourceRetrievalDocuments,
} from "@app/lib/swr/assistants";
import type { ConnectorProvider } from "@app/types";

const LABEL_COLOR_VARIANT = 900;
const VALUE_COLOR_VARIANT = 700;

interface TreemapNode {
  name: string;
  size: number;
  color: string;
  baseColor: string;
  mcpServerConfigIds?: string[];
  mcpServerDisplayName?: string;
  mcpServerName?: string;
  dataSourceId?: string;
  connectorProvider?: ConnectorProvider;
  parentId?: string | null;
  documentId?: string;
  sourceUrl?: string | null;
  children?: TreemapNode[];

  [key: string]: unknown;
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  value?: number;
  depth?: number;
  index?: number;
  color?: string;
  baseColor?: string;
  mcpServerConfigIds?: string[];
  mcpServerDisplayName?: string;
  mcpServerName?: string;
  dataSourceId?: string;
  connectorProvider?: ConnectorProvider;
  parentId?: string | null;
  documentId?: string;
  sourceUrl?: string | null;
  children?: TreemapNode[] | null;
  root?: {
    depth?: number;
    name?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    children?: unknown[] | null;
    value?: number;
  };
  onNodeClick?: (node: TreemapNode) => void;
}

const MIN_TILE_HEIGHT_FOR_VALUE = 24;
const MIN_TILE_HEIGHT_FOR_NAME_AND_VALUE = 42;
const GROUP_OUTLINE_INSET = 2;
const GROUP_OUTLINE_STROKE_WIDTH = 2;
const LEAF_STROKE_WIDTH = 1;
const LEAF_BORDER_RADIUS = 4;
const GROUP_LABEL_HEIGHT = 18;
const MIN_GROUP_WIDTH_FOR_LABEL = 40;
const MIN_GROUP_HEIGHT_FOR_LABEL = 24;
const DOCUMENTS_LIMIT = 200;

function TreemapContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name = "",
  value = 0,
  depth = 0,
  index,
  color = INDEXED_COLORS[0],
  baseColor = "orange",
  mcpServerConfigIds,
  mcpServerDisplayName,
  mcpServerName,
  dataSourceId,
  connectorProvider,
  parentId,
  documentId,
  sourceUrl,
  children,
  root,
  onNodeClick,
}: TreemapContentProps) {
  if (depth === 0) {
    return null;
  }

  if ((children?.length ?? 0) > 0) {
    return null;
  }

  const shouldShowValue = height >= MIN_TILE_HEIGHT_FOR_VALUE;
  const shouldShowName = height >= MIN_TILE_HEIGHT_FOR_NAME_AND_VALUE;
  const isClickable = !!onNodeClick;
  const leafClassName = isClickable ? `${color} cursor-pointer` : color;

  const rootX = root?.x ?? 0;
  const rootY = root?.y ?? 0;
  const rootWidth = root?.width ?? 0;
  const rootHeight = root?.height ?? 0;
  const rootChildrenCount = root?.children?.length ?? 0;

  const shouldShowGroupOutline =
    root?.depth === 1 &&
    typeof index === "number" &&
    index === rootChildrenCount - 1;

  const groupName = root?.name ?? "";
  const groupValue = typeof root?.value === "number" ? root.value : null;
  const groupLabel =
    groupValue !== null ? `${groupName} — ${groupValue}` : groupName;
  const shouldShowGroupLabel =
    shouldShowGroupOutline &&
    groupName.length > 0 &&
    rootWidth >= MIN_GROUP_WIDTH_FOR_LABEL &&
    rootHeight >= MIN_GROUP_HEIGHT_FOR_LABEL;

  const nameTextClassName = documentId ? "text-[10px]" : "text-xs";

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={LEAF_BORDER_RADIUS}
        fill="currentColor"
        className={leafClassName}
        stroke="white"
        strokeWidth={LEAF_STROKE_WIDTH}
        onClick={
          onNodeClick
            ? (e) => {
                e.stopPropagation();
                onNodeClick({
                  name,
                  size: value,
                  color,
                  baseColor,
                  mcpServerConfigIds,
                  mcpServerDisplayName,
                  mcpServerName,
                  dataSourceId,
                  connectorProvider,
                  parentId,
                  documentId,
                  sourceUrl,
                });
              }
            : undefined
        }
      />
      {shouldShowValue && (
        <foreignObject
          x={x}
          y={y}
          width={width}
          height={height}
          pointerEvents="none"
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden p-1 text-center">
            {shouldShowName && (
              <div
                className={cn(
                  "w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium",
                  nameTextClassName,
                  buildColorClass(baseColor, LABEL_COLOR_VARIANT)
                )}
              >
                {name}
              </div>
            )}
            <div
              className={cn(
                "text-xs",
                buildColorClass(baseColor, VALUE_COLOR_VARIANT)
              )}
            >
              {value}
            </div>
          </div>
        </foreignObject>
      )}
      {shouldShowGroupOutline && (
        <rect
          x={rootX + GROUP_OUTLINE_INSET}
          y={rootY + GROUP_OUTLINE_INSET}
          width={Math.max(0, rootWidth - GROUP_OUTLINE_INSET * 2)}
          height={Math.max(0, rootHeight - GROUP_OUTLINE_INSET * 2)}
          rx={2}
          fill="none"
          stroke="white"
          strokeWidth={GROUP_OUTLINE_STROKE_WIDTH}
          pointerEvents="none"
        />
      )}
      {shouldShowGroupLabel && (
        <foreignObject
          x={rootX}
          y={rootY}
          width={Math.max(0, rootWidth)}
          height={GROUP_LABEL_HEIGHT}
          pointerEvents="none"
        >
          <div className="flex h-full w-full items-center justify-center overflow-hidden">
            <div className="w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-white/70 px-1 py-0.5 text-center text-[11px] font-medium text-foreground dark:bg-black/30 dark:text-foreground-night">
              {groupLabel}
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
    const flattenedData: TreemapNode[] = [];
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

  const handleDatasourceClick = useCallback((node: TreemapNode) => {
    const hasConfigIds =
      node.mcpServerConfigIds && node.mcpServerConfigIds.length > 0;
    // Need either config IDs or server name (for servers like data_sources_file_system).
    if (
      (!hasConfigIds && !node.mcpServerName) ||
      !node.mcpServerDisplayName ||
      !node.dataSourceId
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
  }, []);

  const handleDocumentClick = (node: TreemapNode) => {
    if (node.sourceUrl) {
      window.open(node.sourceUrl, "_blank");
    }
  };

  const makeTooltipRenderer = useCallback(
    (total: number) => (props: { payload?: { payload?: TreemapNode }[] }) => {
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
              content={<TreemapContent onNodeClick={handleDocumentClick} />}
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
          content={<TreemapContent onNodeClick={handleDatasourceClick} />}
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
