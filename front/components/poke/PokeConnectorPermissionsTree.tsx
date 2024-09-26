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
  displayDocumentSource,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  permissionFilter?: ConnectorPermission;
  showExpand?: boolean;
  displayDocumentSource: (documentId: string) => void;
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
        displayDocumentSource={displayDocumentSource}
        useResourcesHook={useResourcesHook}
        isSearchEnabled={false}
      />
    </div>
  );
}
