import type {
  ConnectorPermission,
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";

import type { ContentNodeTreeItemStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";

interface DataSourceViewPermissionTreeProps {
  dataSourceView: DataSourceViewType;
  onDocumentViewClick: (documentId: string) => void;
  isSearchEnabled?: boolean;
  isRoundedBackground?: boolean;
  owner: LightWorkspaceType;
  parentId?: string | null;
  permissionFilter?: ConnectorPermission;
  showExpand?: boolean;
  viewType: ContentNodesViewType;
  selectedNodes?: Record<string, ContentNodeTreeItemStatus>;
  setSelectedNodes?: (
    updater: (
      prev: Record<string, ContentNodeTreeItemStatus>
    ) => Record<string, ContentNodeTreeItemStatus>
  ) => void;
}

export function DataSourceViewPermissionTree({
  dataSourceView,
  isSearchEnabled,
  isRoundedBackground,
  owner,
  onDocumentViewClick,
  showExpand,
  viewType,
  selectedNodes,
  setSelectedNodes,
}: DataSourceViewPermissionTreeProps) {
  const useResourcesHook = (parentId: string | null) => {
    const res = useDataSourceViewContentNodes({
      dataSourceView: dataSourceView,
      owner,
      parentId: parentId ?? undefined,
      viewType,
    });
    return {
      resources: res.nodes,
      isResourcesLoading: res.isNodesLoading,
      isResourcesError: res.isNodesError,
    };
  };

  return (
    <ContentNodeTree
      isSearchEnabled={isSearchEnabled}
      isRoundedBackground={isRoundedBackground}
      onDocumentViewClick={onDocumentViewClick}
      showExpand={showExpand}
      useResourcesHook={useResourcesHook}
      selectedNodes={selectedNodes}
      setSelectedNodes={setSelectedNodes}
    />
  );
}
