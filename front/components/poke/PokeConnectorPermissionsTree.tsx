import type {
  ConnectorPermission,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";

import { DataSourcePermissionTreeChildren } from "@app/components/ConnectorPermissionsTree";
import { usePokeConnectorPermissions } from "@app/lib/swr/poke";

export function PokePermissionTree({
  owner,
  dataSource,
  permissionFilter,
  canUpdatePermissions,
  showExpand,
  displayDocumentSource,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  permissionFilter?: ConnectorPermission;
  canUpdatePermissions?: boolean;
  showExpand?: boolean;
  displayDocumentSource: (documentId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <DataSourcePermissionTreeChildren
        owner={owner}
        dataSource={dataSource}
        parentId={null}
        permissionFilter={permissionFilter}
        canUpdatePermissions={canUpdatePermissions}
        showExpand={showExpand}
        parentIsSelected={false}
        displayDocumentSource={displayDocumentSource}
        useConnectorPermissionsHook={usePokeConnectorPermissions}
        isSearchEnabled={false}
      />
    </div>
  );
}
