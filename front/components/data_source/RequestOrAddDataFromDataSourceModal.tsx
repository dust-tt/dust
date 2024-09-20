import { Button, PlusIcon } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import { ConnectorPermissionsModal } from "@app/components/ConnectorPermissionsModal";
import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import { useConnector } from "@app/lib/swr/connectors";

interface RequestOrAddDataFromDataSourceModalProps {
  owner: WorkspaceType;
  dataSource: DataSourceType;
}

export function RequestOrAddDataFromDataSourceModal({
  owner,
  dataSource,
}: RequestOrAddDataFromDataSourceModalProps) {
  const [showConnectorPermissionsModal, setShowConnectorPermissionsModal] =
    useState(false);
  const { connector } = useConnector({
    workspaceId: owner.sId,
    dataSource: dataSource,
  });
  return (
    <>
      {owner.role === "admin" && connector ? (
        <>
          <Button
            label="Add Data"
            icon={PlusIcon}
            onClick={() => {
              setShowConnectorPermissionsModal(true);
            }}
          />
          <ConnectorPermissionsModal
            owner={owner}
            connector={connector}
            dataSource={dataSource}
            isOpen={showConnectorPermissionsModal}
            onClose={() => {
              setShowConnectorPermissionsModal(false);
            }}
            readOnly={false}
            isAdmin={owner.role === "admin"}
          />
        </>
      ) : (
        <RequestDataSourceModal dataSources={[dataSource]} owner={owner} />
      )}
    </>
  );
}
