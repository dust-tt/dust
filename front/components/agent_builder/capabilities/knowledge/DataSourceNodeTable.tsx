import { Spinner } from "@dust-tt/sparkle";
import React, { memo, useCallback, useMemo } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { DataSourceList } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  findDataSourceViewFromNavigationHistory,
  getLatestNodeFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { useInfiniteDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type { ContentNodesViewType } from "@app/types";

const PAGE_SIZE = 25;

interface DataSourceNodeTableProps {
  viewType: ContentNodesViewType;
}

export const DataSourceNodeTable = memo(function DataSourceNodeTable({
  viewType,
}: DataSourceNodeTableProps) {
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

  const handleLoadMore = useCallback(async () => {
    if (hasNextPage && !isLoadingMore) {
      await loadMore();
    }
  }, [hasNextPage, isLoadingMore, loadMore]);

  const listItems: DataSourceListItem[] = useMemo(
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
            tagsFilter: null,
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
    <DataSourceList
      items={listItems}
      onLoadMore={handleLoadMore}
      hasMore={hasNextPage}
      isLoading={isLoadingMore}
      showSelectAllHeader
      headerTitle="Name"
    />
  );
});
