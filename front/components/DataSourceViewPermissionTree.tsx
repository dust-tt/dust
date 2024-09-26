import type {
  ConnectorPermission,
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";

import type { ContentNodeTreeNodeStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";

interface DataSourceViewPermissionTreeProps {
  dataSourceView: DataSourceViewType;
  displayDocumentSource: (documentId: string) => void;
  isSearchEnabled?: boolean;
  isRoundedBackground?: boolean;
  owner: LightWorkspaceType;
  parentId?: string | null;
  permissionFilter?: ConnectorPermission;
  showExpand?: boolean;
  viewType: ContentNodesViewType;
  treeSelectionModel?: Record<string, ContentNodeTreeNodeStatus>;
  setTreeSelectionModel?: (
    updater: (
      prev: Record<string, ContentNodeTreeNodeStatus>
    ) => Record<string, ContentNodeTreeNodeStatus>
  ) => void;
}

export function DataSourceViewPermissionTree({
  dataSourceView,
  isSearchEnabled,
  isRoundedBackground,
  owner,
  displayDocumentSource,
  showExpand,
  viewType,
  treeSelectionModel,
  setTreeSelectionModel,
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
      displayDocumentSource={displayDocumentSource}
      showExpand={showExpand}
      useResourcesHook={useResourcesHook}
      treeSelectionModel={treeSelectionModel}
      setTreeSelectionModel={setTreeSelectionModel}
    />
  );
}
