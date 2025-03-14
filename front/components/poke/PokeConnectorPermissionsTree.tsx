import type {
  ConnectorPermission,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { useCallback } from "react";

import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { usePokeConnectorPermissions } from "@app/lib/swr/poke";

const getUseResourceHook =
  (
    owner: WorkspaceType,
    dataSource: DataSourceType,
    permissionFilter?: ConnectorPermission
  ) =>
  (parentId: string | null) =>
    usePokeConnectorPermissions({
      dataSource,
      filterPermission: permissionFilter ?? null,
      owner,
      parentId,
    });

type PokePermissionTreeProps = {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  permissionFilter?: ConnectorPermission;
  showExpand?: boolean;
  onDocumentViewClick: (documentId: string) => void;
};

export function PokePermissionTree({
  owner,
  dataSource,
  permissionFilter,
  showExpand,
  onDocumentViewClick,
}: PokePermissionTreeProps) {
  const useResourcesHook = useCallback(
    (parentId: string | null) =>
      getUseResourceHook(owner, dataSource, permissionFilter)(parentId),
    [owner, dataSource, permissionFilter]
  );

  return (
    <div className="overflow-x-auto">
      <ContentNodeTree
        showExpand={showExpand}
        onDocumentViewClick={onDocumentViewClick}
        useResourcesHook={useResourcesHook}
      />
    </div>
  );
}
