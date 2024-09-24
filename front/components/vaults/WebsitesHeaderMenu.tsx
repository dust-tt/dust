import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { useState } from "react";

import VaultWebsiteModal from "@app/components/vaults/VaultWebsiteModal";
import { useDataSources } from "@app/lib/swr/data_sources";

type WebsitesHeaderMenuProps = {
  owner: WorkspaceType;
  vault: VaultType;
  canWriteInVault: boolean;
  dataSourceView: DataSourceViewType;
};

export const WebsitesHeaderMenu = ({
  owner,
  vault,
  canWriteInVault,
  dataSourceView,
}: WebsitesHeaderMenuProps) => {
  const [showEditWebsiteModal, setShowEditWebsiteModal] = useState(false);

  const { dataSources } = useDataSources(owner);

  return (
    <>
      <VaultWebsiteModal
        isOpen={showEditWebsiteModal}
        onClose={() => {
          setShowEditWebsiteModal(false);
        }}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        dataSourceView={dataSourceView}
      />
      <Button
        size="sm"
        label="Edit Website"
        icon={Cog6ToothIcon}
        variant="primary"
        onClick={() => {
          setShowEditWebsiteModal(true);
        }}
        disabled={!canWriteInVault}
      />
    </>
  );
};
