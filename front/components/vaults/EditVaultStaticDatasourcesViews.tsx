import { Button, PlusIcon, Popup } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useCallback, useState } from "react";

import VaultCreateFolderModal from "@app/components/vaults/VaultCreateFolderModal";
import VaultCreateWebsiteModal from "@app/components/vaults/VaultCreateWebsiteModal";

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
      <VaultCreateFolderModal
        isOpen={showAddFolderModal}
        setOpen={(isOpen) => {
          setShowAddFolderModal(isOpen);
        }}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
      />
      <VaultCreateWebsiteModal
        isOpen={showAddWebsiteModal}
        setOpen={(isOpen) => {
          setShowAddWebsiteModal(isOpen);
        }}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        dataSourceOrView={null} // null for a website creation.
        webCrawlerConfiguration={null} // null for a website creation.
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
