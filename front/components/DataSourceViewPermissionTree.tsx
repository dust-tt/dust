import { Tree } from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useCallback } from "react";

import type { ContentNodeTreeItemStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";

const getUseResourceHook =
  (
    owner: LightWorkspaceType,
    dataSourceView: DataSourceViewType,
    viewType: ContentNodesViewType
  ) =>
  (parentId: string | null) => {
    const res = useDataSourceViewContentNodes({
      dataSourceView: dataSourceView,
      owner,
      parentId: parentId ?? undefined,
      viewType,
    });
    return {
      resources: res.nodes.map((n) => ({
        ...n,
        preventSelection:
          n.preventSelection ||
          (viewType === "tables" && n.type !== "database"),
      })),
      isResourcesLoading: res.isNodesLoading,
      isResourcesError: res.isNodesError,
    };
  };

interface DataSourceViewPermissionTreeProps {
  dataSourceView: DataSourceViewType;
  isRoundedBackground?: boolean;
  isSearchEnabled?: boolean;
  onDocumentViewClick: (documentId: string) => void;
  owner: LightWorkspaceType;
  parentId?: string | null;
  selectedNodes?: Record<string, ContentNodeTreeItemStatus>;
  setSelectedNodes?: (
    updater: (
      prev: Record<string, ContentNodeTreeItemStatus>
    ) => Record<string, ContentNodeTreeItemStatus>
  ) => void;
  showExpand?: boolean;
  viewType: ContentNodesViewType;
}

export function DataSourceViewPermissionTree({
  dataSourceView,
  isRoundedBackground,
  isSearchEnabled,
  onDocumentViewClick,
  owner,
  parentId,
  selectedNodes,
  setSelectedNodes,
  showExpand,
  viewType,
}: DataSourceViewPermissionTreeProps) {
  const useResourcesHook = useCallback(
    (selectedParentId: string | null) =>
      getUseResourceHook(
        owner,
        dataSourceView,
        viewType
      )(selectedParentId || parentId || null),
    [owner, dataSourceView, viewType, parentId]
  );

  return (
    <ContentNodeTree
      isSearchEnabled={isSearchEnabled}
      isRoundedBackground={isRoundedBackground}
      onDocumentViewClick={onDocumentViewClick}
      showExpand={showExpand}
      useResourcesHook={useResourcesHook}
      selectedNodes={selectedNodes}
      setSelectedNodes={setSelectedNodes}
      emptyComponent={
        viewType === "tables" ? (
          <Tree.Empty label="No tables" />
        ) : (
          <Tree.Empty label="No documents" />
        )
      }
    />
  );
}
