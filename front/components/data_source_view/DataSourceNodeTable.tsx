import { ScrollableDataTable, Spinner } from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  findDataSourceViewFromNavigationHistory,
  getLatestNodeFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import type { DataSourceRowData } from "@app/components/data_source_view/hooks/useDataSourceColumns";
import { useDataSourceColumns } from "@app/components/data_source_view/hooks/useDataSourceColumns";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { useInfiniteDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type { ContentNodesViewType } from "@app/types";

const PAGE_SIZE = 25;

interface DataSourceNodeTableProps {
  viewType: ContentNodesViewType;
}

export function DataSourceNodeTable({ viewType }: DataSourceNodeTableProps) {
  const { owner } = useAgentBuilderContext();
  const { navigationHistory, addNodeEntry } = useDataSourceBuilderContext();

  const traversedNode = getLatestNodeFromNavigationHistory(navigationHistory);
  const dataSourceView =
    findDataSourceViewFromNavigationHistory(navigationHistory);

  const {
    nodes: childNodes,
    isNodesLoading,
    hasNextPage,
    loadMore,
    isLoadingMore,
  } = useInfiniteDataSourceViewContentNodes({
    owner,
    dataSourceView:
      traversedNode?.dataSourceView ?? dataSourceView ?? undefined,
    parentId:
      traversedNode !== null && traversedNode.parentInternalIds !== null
        ? traversedNode.internalId
        : undefined,
    viewType,
    pagination: { limit: PAGE_SIZE, cursor: null },
    sorting: [{ field: "title", direction: "asc" }],
  });

  const handleLoadMore = async () => {
    if (hasNextPage && !isLoadingMore) {
      await loadMore();
    }
  };

  const columns = useDataSourceColumns();
  const nodeRows: DataSourceRowData[] = useMemo(
    () =>
      childNodes.map((node) => {
        return {
          id: node.internalId,
          title: node.title,
          icon: getVisualForDataSourceViewContentNode(node),
          onClick: node.expandable ? () => addNodeEntry(node) : undefined,
          entry: {
            type: "node",
            node,
          },
        };
      }),
    [childNodes, addNodeEntry]
  );

  if (isNodesLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <ScrollableDataTable
      data={nodeRows}
      columns={columns}
      getRowId={(row) => row.id}
      onLoadMore={handleLoadMore}
      isLoading={isLoadingMore}
    />
  );
}
