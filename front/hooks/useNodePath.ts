import { useMemo } from "react";

import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type { DataSourceViewContentNode, LightWorkspaceType } from "@app/types";

export function useNodePath({
  node,
  owner,
  disabled = false,
}: {
  node?: DataSourceViewContentNode;
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { nodes: parentNodes, isNodesLoading } = useDataSourceViewContentNodes({
    owner,
    dataSourceView: node?.dataSourceView,
    internalIds: node?.parentInternalIds ?? [],
    viewType: "all",
    disabled: disabled || !node || !node.parentInternalIds?.length,
  });

  const fullPath = useMemo(() => {
    if (disabled || !node || !node.parentInternalIds?.length) {
      return [];
    }

    if (isNodesLoading || parentNodes.length === 0) {
      return [];
    }

    // Sort parent nodes by their position in parentInternalIds to maintain order
    const sortedParentNodes = node.parentInternalIds
      .map((parentId) => parentNodes.find((n) => n.internalId === parentId))
      .filter((node): node is DataSourceViewContentNode => node !== undefined)
      .reverse();

    return sortedParentNodes;
  }, [disabled, node, isNodesLoading, parentNodes]);

  return {
    fullPath,
    isLoading: isNodesLoading,
  };
}
