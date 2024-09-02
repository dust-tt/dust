import { Button, PlusIcon, Popup } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useCallback, useState } from "react";

import VaultFolderModal from "@app/components/vaults/VaultFolderModal";
import VaultWebsiteModal from "@app/components/vaults/VaultWebsiteModal";

export function EditVaultStaticDataSourcesViews({
  owner,
  plan,
  vault,
  category,
  dataSources,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  vault: VaultType;
  category: "folder" | "website";
  dataSources: DataSourceType[];
}) {
  const router = useRouter();
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [showAddWebsiteModal, setShowAddWebsiteModal] = useState(false);
  const [showDatasourceLimitPopup, setShowDatasourceLimitPopup] =
    useState(false);

  const planDataSourcesLimit = plan.limits.dataSources.count;
  const checkLimitsAndOpenModal = useCallback(() => {
    if (
      planDataSourcesLimit != -1 &&
      dataSources.length >= planDataSourcesLimit
    ) {
      setShowDatasourceLimitPopup(true);
    } else if (category === "folder") {
      setShowAddFolderModal(true);
    } else if (category === "website") {
      setShowAddWebsiteModal(true);
    }
  }, [category, dataSources, planDataSourcesLimit]);

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
      <VaultFolderModal
        isOpen={showAddFolderModal}
        setOpen={(isOpen) => {
          setShowAddFolderModal(isOpen);
        }}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        folder={null} // null for a folder creation.
      />
      <VaultWebsiteModal
        isOpen={showAddWebsiteModal}
        setOpen={(isOpen) => {
          setShowAddWebsiteModal(isOpen);
        }}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        dataSourceView={null} // null for a website creation.
        connectorConfiguration={null}
      />
      <Button
        label={category === "folder" ? "Add folder" : "Add website"}
        onClick={async () => {
          await checkLimitsAndOpenModal();
        }}
        icon={PlusIcon}
      />
    </>
  );
}
