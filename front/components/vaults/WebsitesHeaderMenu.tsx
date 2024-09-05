import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  VaultType,
  WebCrawlerConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { isWebCrawlerConfiguration } from "@dust-tt/types";
import { useState } from "react";

import VaultWebsiteModal from "@app/components/vaults/VaultWebsiteModal";
import { useDataSourceViewConnectorConfiguration } from "@app/lib/swr/data_source_views";
import { useDataSources } from "@app/lib/swr/data_sources";

type WebsitesHeaderMenuProps = {
  owner: WorkspaceType;
  vault: VaultType;
  dataSourceView: DataSourceViewType;
};

export const WebsitesHeaderMenu = ({
  owner,
  vault,
  dataSourceView,
}: WebsitesHeaderMenuProps) => {
  const [showEditWebsiteModal, setShowEditWebsiteModal] = useState(false);

  const { dataSources } = useDataSources(owner);
  const { configuration } = useDataSourceViewConnectorConfiguration({
    dataSourceView,
    owner,
  });

  let webCrawlerConfiguration: WebCrawlerConfigurationType | null = null;
  if (isWebCrawlerConfiguration(configuration)) {
    webCrawlerConfiguration = configuration;
  }

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
        webCrawlerConfiguration={webCrawlerConfiguration}
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
