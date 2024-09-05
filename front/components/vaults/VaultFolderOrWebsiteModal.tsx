import { Button, PlusIcon, Popup } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  DataSourceViewWithConnectorType,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { isWebCrawlerConfiguration } from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useCallback, useState } from "react";

import VaultFolderModal from "@app/components/vaults/VaultFolderModal";
import VaultWebsiteModal from "@app/components/vaults/VaultWebsiteModal";
import { useDataSourceViewConnectorConfiguration } from "@app/lib/swr/data_source_views";

interface ModalProps {
  owner: WorkspaceType;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  plan: PlanType;
  vault: VaultType;
  dataSources: DataSourceType[];
  dataSourceView: DataSourceViewWithConnectorType | null;
  category: "folder" | "website";
  onClose: () => void;
}

export function VaultFolderOrWebsiteModal({
  owner,
  plan,
  vault,
  isOpen,
  setOpen,
  dataSources,
  dataSourceView,
  category,
  onClose,
}: ModalProps): React.ReactElement {
  const router = useRouter();
  const [showDatasourceLimitPopup, setShowDatasourceLimitPopup] =
    useState(false);

  const { configuration } = useDataSourceViewConnectorConfiguration({
    dataSourceView: category === "website" ? dataSourceView : null,
    owner,
  });

  const planDataSourcesLimit = plan.limits.dataSources.count;

  const checkLimitsAndOpenModal = useCallback(() => {
    if (
      planDataSourcesLimit !== -1 &&
      dataSources.length >= planDataSourcesLimit
    ) {
      setShowDatasourceLimitPopup(true);
    } else {
      setOpen(true);
    }
  }, [dataSources.length, planDataSourcesLimit, setOpen]);

  const handleClose = () => {
    setOpen(false);
    onClose();
  };

  return (
    <>
      <Popup
        show={showDatasourceLimitPopup}
        chipLabel={`${plan.name} plan`}
        description={`You have reached the limit of data sources (${plan.limits.dataSources.count} data sources). Upgrade your plan for unlimited datasources.`}
        buttonLabel="Check Dust plans"
        buttonClick={() => {
          void router.push(`/w/${owner.sId}/subscription`);
        }}
        onClose={() => {
          setShowDatasourceLimitPopup(false);
        }}
        className="absolute bottom-8 right-0"
      />
      {category === "folder" ? (
        <VaultFolderModal
          isOpen={isOpen}
          setOpen={handleClose}
          owner={owner}
          vault={vault}
          dataSources={dataSources}
          folder={dataSourceView?.dataSource ?? null}
        />
      ) : category === "website" ? (
        <VaultWebsiteModal
          isOpen={isOpen}
          setOpen={handleClose}
          owner={owner}
          vault={vault}
          dataSources={dataSources}
          dataSourceView={dataSourceView}
          webCrawlerConfiguration={
            configuration && isWebCrawlerConfiguration(configuration)
              ? configuration
              : null
          }
        />
      ) : null}
      <Button
        label={category === "folder" ? "Add folder" : "Add website"}
        onClick={checkLimitsAndOpenModal}
        icon={PlusIcon}
      />
    </>
  );
}
