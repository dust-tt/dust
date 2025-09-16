import { Tree } from "@dust-tt/sparkle";
import { useCallback } from "react";

import type { ContentNodeTreeItemStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@app/types";

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
      resources: res.nodes,
      totalResourceCount: res.totalNodesCount,
      isResourcesLoading: res.isNodesLoading,
      isResourcesError: res.isNodesError,
      isResourcesTruncated: !res.totalNodesCountIsAccurate,
    };
  };

interface DataSourceViewPermissionTreeProps {
  dataSourceView: DataSourceViewType;
  isRoundedBackground?: boolean;
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
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      )(selectedParentId || parentId || null),
    [owner, dataSourceView, viewType, parentId]
  );

  return (
    <ContentNodeTree
      isRoundedBackground={isRoundedBackground}
      onDocumentViewClick={onDocumentViewClick}
      showExpand={showExpand}
      useResourcesHook={useResourcesHook}
      selectedNodes={selectedNodes}
      setSelectedNodes={setSelectedNodes}
      emptyComponent={
        viewType === "table" ? (
          <Tree.Empty label="No tables" />
        ) : viewType === "document" ? (
          <Tree.Empty label="No documents" />
        ) : (
          <Tree.Empty label="No data" />
        )
      }
    />
  );
}
