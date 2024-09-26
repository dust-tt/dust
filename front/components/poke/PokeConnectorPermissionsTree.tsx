import type {
  ConnectorPermission,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";

import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { usePokeConnectorPermissions } from "@app/lib/swr/poke";

export function PokePermissionTree({
  owner,
  dataSource,
  permissionFilter,
  showExpand,
  onDocumentViewClick,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  permissionFilter?: ConnectorPermission;
  showExpand?: boolean;
  onDocumentViewClick: (documentId: string) => void;
}) {
  const useResourcesHook = (parentId: string | null) =>
    usePokeConnectorPermissions({
      dataSource,
      filterPermission: permissionFilter ?? null,
      owner,
      parentId,
    });

  return (
    <div className="overflow-x-auto">
      <ContentNodeTree
        showExpand={showExpand}
        onDocumentViewClick={onDocumentViewClick}
        useResourcesHook={useResourcesHook}
        isSearchEnabled={false}
      />
    </div>
  );
}
