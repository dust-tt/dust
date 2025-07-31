import { useMemo } from "react";

import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type { DataSourceViewContentNode, LightWorkspaceType } from "@app/types";

export function useNodePath({
  node,
  owner,
  enabled = false,
}: {
  node: DataSourceViewContentNode;
  owner: LightWorkspaceType;
  enabled?: boolean;
}) {
  const { nodes: parentNodes, isNodesLoading } = useDataSourceViewContentNodes({
    owner,
    dataSourceView: node.dataSourceView,
    internalIds: node.parentInternalIds ?? [],
    viewType: "all",
    disabled: !enabled || !node.parentInternalIds?.length,
  });

  const fullPath = useMemo(() => {
    if (!enabled || !node.parentInternalIds?.length) {
      return null;
    }

    if (isNodesLoading || parentNodes.length === 0) {
      return null;
    }

    // Sort parent nodes by their position in parentInternalIds to maintain order
    const sortedParentNodes = node.parentInternalIds
      .map((parentId) => parentNodes.find((n) => n.internalId === parentId))
      .filter((node): node is DataSourceViewContentNode => node !== undefined)
      .reverse();

    return sortedParentNodes;
  }, [enabled, node.parentInternalIds, isNodesLoading, parentNodes]);

  return {
    fullPath,
    isLoading: isNodesLoading,
  };
}
