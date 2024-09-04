import type {
  DataSourceType,
  DataSourceViewWithConnectorType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import React from "react";

import VaultFolderModal from "@app/components/vaults/VaultFolderModal";
import VaultWebsiteModal from "@app/components/vaults/VaultWebsiteModal";
import { useDataSourceViewConnectorConfiguration } from "@app/lib/swr/data_source_views";

interface ModalProps {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  vault: VaultType;
  dataSources: DataSourceType[];
  dataSourceView: DataSourceViewWithConnectorType;
}

export const VaultFolderOrWebsiteModal: React.FC<ModalProps> = ({
  isOpen,
  setOpen,
  owner,
  vault,
  dataSources,
  dataSourceView,
}) => {
  const { configuration } = useDataSourceViewConnectorConfiguration({
    dataSourceView,
    owner,
  });
  if (dataSourceView.category === "website") {
    return (
      <VaultWebsiteModal
        isOpen={isOpen}
        setOpen={setOpen}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        dataSourceView={dataSourceView}
        webCrawlerConfiguration={configuration}
      />
    );
  } else if (dataSourceView.category === "folder") {
    return (
      <VaultFolderModal
        isOpen={isOpen}
        setOpen={setOpen}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        folder={dataSourceView.dataSource}
      />
    );
  }
  return <></>;
};
