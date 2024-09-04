import type {
  DataSourceType,
  DataSourceViewWithConnectorType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { isWebCrawlerConfiguration } from "@dust-tt/types";
import React from "react";

import VaultFolderModal from "@app/components/vaults/VaultFolderModal";
import VaultWebsiteModal from "@app/components/vaults/VaultWebsiteModal";

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
  if (
    dataSourceView.category === "website" &&
    dataSourceView.dataSource.connector &&
    isWebCrawlerConfiguration(dataSourceView.dataSource.connector.configuration)
  ) {
    return (
      <VaultWebsiteModal
        isOpen={isOpen}
        setOpen={setOpen}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        dataSourceView={dataSourceView}
        webCrawlerConfiguration={
          dataSourceView.dataSource.connector.configuration
        }
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
