import { Spinner } from "@dust-tt/sparkle";
import React, { useCallback, useMemo } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { DataSourceList } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  findDataSourceViewFromNavigationHistory,
  getLatestNodeFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { getDisplayTitleForDataSourceViewContentNode } from "@app/lib/providers/content_nodes_display";
import { useInfiniteDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type { ContentNodesViewType } from "@app/types";

const PAGE_SIZE = 50;

interface DataSourceNodeTableProps {
  viewType: ContentNodesViewType;
}

function getDuplicateTitles(nodes: { title: string }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    counts.set(node.title, (counts.get(node.title) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()].filter(([, c]) => c > 1).map(([t]) => t)
  );
}

export function DataSourceNodeTable({ viewType }: DataSourceNodeTableProps) {
  const { owner } = useAgentBuilderContext();
  const { navigationHistory, addNodeEntry } = useDataSourceBuilderContext();

  const traversedNode = getLatestNodeFromNavigationHistory(navigationHistory);
  const dataSourceView =
    findDataSourceViewFromNavigationHistory(navigationHistory);

  const parentId =
    traversedNode !== null && traversedNode.parentInternalIds !== null
      ? traversedNode.internalId
      : undefined;
  const isTopLevelInView = !parentId;

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
    parentId,
    viewType,
    pagination: { limit: PAGE_SIZE, cursor: null },
    sorting: [{ field: "title", direction: "asc" }],
  });

  const handleLoadMore = useCallback(async () => {
    if (hasNextPage && !isLoadingMore) {
      await loadMore();
    }
  }, [hasNextPage, isLoadingMore, loadMore]);

  const duplicateTitles = useMemo(() => {
    return isTopLevelInView
      ? getDuplicateTitles(childNodes)
      : new Set<string>();
  }, [childNodes, isTopLevelInView]);

  const listItems: DataSourceListItem[] = useMemo(
    () =>
      childNodes.map((node) => {
        return {
          id: node.internalId,
          title: getDisplayTitleForDataSourceViewContentNode(node, {
            prefixSiteName: isTopLevelInView && duplicateTitles.has(node.title),
          }),
          icon: getVisualForDataSourceViewContentNode(node),
          onClick: node.expandable ? () => addNodeEntry(node) : undefined,
          entry: {
            type: "node",
            node,
            tagsFilter: null,
          },
        };
      }),
    [childNodes, addNodeEntry, duplicateTitles, isTopLevelInView]
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
}
