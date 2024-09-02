import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";
import type {
  ConnectorConfiguration,
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { useState } from "react";

import VaultWebsiteModal from "@app/components/vaults/VaultWebsiteModal";
import { useDataSources } from "@app/lib/swr";

type WebsitesHeaderMenuProps = {
  owner: WorkspaceType;
  vault: VaultType;
  dataSourceView: DataSourceViewType;
  connectorConfiguration: ConnectorConfiguration | null;
};

export const WebsitesHeaderMenu = ({
  owner,
  vault,
  dataSourceView,
  connectorConfiguration,
}: WebsitesHeaderMenuProps) => {
  const [showEditWebsiteModal, setShowEditWebsiteModal] = useState(false);

  const { dataSources } = useDataSources(owner);

  return (
    <>
      <VaultWebsiteModal
        isOpen={showEditWebsiteModal}
        setOpen={(isOpen) => {
          setShowEditWebsiteModal(isOpen);
        }}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        dataSourceView={dataSourceView}
        connectorConfiguration={connectorConfiguration}
      />
      <Button
        size="sm"
        label="Edit Website"
        icon={Cog6ToothIcon}
        variant="primary"
        onClick={() => {
          setShowEditWebsiteModal(true);
        }}
      />
    </>
  );
};
