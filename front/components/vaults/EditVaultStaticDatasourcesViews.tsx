import { Button, PlusIcon, Popup, Tooltip } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  DataSourceViewType,
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

interface EditVaultStaticDatasourcesViewsProps {
  owner: WorkspaceType;
  canWriteInVault: boolean;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  plan: PlanType;
  vault: VaultType;
  dataSources: DataSourceType[];
  dataSourceView: DataSourceViewType | null;
  category: "folder" | "website";
  onClose: () => void;
}

export function EditVaultStaticDatasourcesViews({
  owner,
  canWriteInVault,
  plan,
  vault,
  isOpen,
  setOpen,
  dataSources,
  dataSourceView,
  category,
  onClose,
}: EditVaultStaticDatasourcesViewsProps) {
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
          onClose={onClose}
          owner={owner}
          vault={vault}
          dataSources={dataSources}
          folder={dataSourceView?.dataSource ?? null}
        />
      ) : category === "website" ? (
        <VaultWebsiteModal
          isOpen={isOpen}
          onClose={onClose}
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
      {canWriteInVault ? (
        <Button
          label={`Add ${category}`}
          onClick={checkLimitsAndOpenModal}
          icon={PlusIcon}
          disabled={!canWriteInVault}
        />
      ) : (
        <Tooltip
          label={
            vault.kind === "global"
              ? `Only builders of the workspace can add a ${category} in the Company data Vault.`
              : `Only members of the vault can add a ${category}.`
          }
          position="above"
        >
          <Button
            label={`Add ${category}`}
            onClick={checkLimitsAndOpenModal}
            icon={PlusIcon}
            disabled={!canWriteInVault}
          />
        </Tooltip>
      )}
    </>
  );
}
