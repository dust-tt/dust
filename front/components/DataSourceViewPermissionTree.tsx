import type { ContentNodeTreeItemStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import { Tree } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

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
  const { t } = useLingui();
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
      isRoundedBackground={isRoundedBackground}
      onDocumentViewClick={onDocumentViewClick}
      showExpand={showExpand}
      useResourcesHook={useResourcesHook}
      selectedNodes={selectedNodes}
      setSelectedNodes={setSelectedNodes}
      emptyComponent={
        viewType === "table" ? (
          <Tree.Empty label={t`No tables`} />
        ) : viewType === "document" ? (
          <Tree.Empty label={t`No documents`} />
        ) : (
          <Tree.Empty label={t`No data`} />
        )
      }
    />
  );
}
