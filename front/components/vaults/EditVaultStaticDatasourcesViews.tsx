import { Button, PlusIcon, Popup, Tooltip } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  DataSourceViewType,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import VaultFolderModal from "@app/components/vaults/VaultFolderModal";
import VaultWebsiteModal from "@app/components/vaults/VaultWebsiteModal";

interface EditVaultStaticDatasourcesViewsProps {
  owner: WorkspaceType;
  canWriteInVault: boolean;
  isOpen: boolean;
  plan: PlanType;
  vault: VaultType;
  dataSources: DataSourceType[];
  dataSourceView: DataSourceViewType | null;
  category: "folder" | "website";
  onOpen: () => void;
  onClose: () => void;
}

export function EditVaultStaticDatasourcesViews({
  owner,
  canWriteInVault,
  plan,
  vault,
  isOpen,
  dataSources,
  dataSourceView,
  category,
  onOpen,
  onClose,
}: EditVaultStaticDatasourcesViewsProps) {
  const router = useRouter();
  const [showDatasourceLimitPopup, setShowDatasourceLimitPopup] =
    useState(false);

  const planDataSourcesLimit = plan.limits.dataSources.count;

  const checkLimitsAndOpenModal = useCallback(() => {
    if (
      planDataSourcesLimit !== -1 &&
      dataSources.length >= planDataSourcesLimit
    ) {
      setShowDatasourceLimitPopup(true);
    } else {
      onOpen();
    }
  }, [dataSources.length, planDataSourcesLimit, onOpen]);

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
          dataSourceViewId={dataSourceView ? dataSourceView.sId : null}
        />
      ) : category === "website" ? (
        <VaultWebsiteModal
          isOpen={isOpen}
          onClose={onClose}
          owner={owner}
          vault={vault}
          dataSources={dataSources}
          dataSourceView={dataSourceView}
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
          side="top"
          trigger={
            <Button
              label={`Add ${category}`}
              onClick={checkLimitsAndOpenModal}
              icon={PlusIcon}
              disabled={!canWriteInVault}
            />
          }
        />
      )}
    </>
  );
}
