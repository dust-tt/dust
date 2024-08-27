import { Button, PlusIcon, Spinner } from "@dust-tt/sparkle";
import type {
  APIError,
  ManagedDataSourceViewsSelectedNodes,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import React, { useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import VaultManagedDataSourcesViewsModal from "@app/components/vaults/VaultManagedDatasourcesViewsModal";
import { useVaultDataSourceViews } from "@app/lib/swr";

export function EditVaultManagedDataSourcesViews({
  owner,
  vault,
  systemVault,
}: {
  owner: WorkspaceType;
  vault: VaultType;
  systemVault: VaultType;
}) {
  const sendNotification = React.useContext(SendNotificationsContext);

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);

  // DataSources Views of the current vault.
  const {
    vaultDataSourceViews,
    isVaultDataSourceViewsLoading,
    mutateVaultDataSourceViews,
  } = useVaultDataSourceViews({
    workspaceId: owner.sId,
    vaultId: vault.sId,
    category: "managed",
  });

  // DataSources Views of the system vault holding the managed datasources we want to select data from.
  const {
    vaultDataSourceViews: systemVaultDataSourceViews,
    isVaultDataSourceViewsLoading: isSystemVaultDataSourceViewsLoading,
  } = useVaultDataSourceViews({
    workspaceId: owner.sId,
    vaultId: systemVault.sId,
    category: "managed",
  });

  const updateVaultDataSourceViews = async (
    selectedNodes: ManagedDataSourceViewsSelectedNodes
  ) => {
    const promisesErrors = await Promise.all(
      selectedNodes.map(async (sDs) => {
        const existingViewForDs = vaultDataSourceViews.find(
          (d) => d.dataSource.name === sDs.name
        );

        const body = {
          name: sDs.name,
          parentsIn: sDs.parentsIn,
        };

        try {
          let res;
          if (existingViewForDs) {
            if (sDs.parentsIn !== null && sDs.parentsIn.length === 0) {
              res = await fetch(
                `/api/w/${owner.sId}/vaults/${vault.sId}/data_source_views/${existingViewForDs.sId}`,
                {
                  method: "DELETE",
                  headers: {
                    "Content-Type": "application/json",
                  },
                }
              );
            } else {
              res = await fetch(
                `/api/w/${owner.sId}/vaults/${vault.sId}/data_source_views/${existingViewForDs.sId}`,
                {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(body),
                }
              );
            }
          } else {
            res = await fetch(
              `/api/w/${owner.sId}/vaults/${vault.sId}/data_source_views`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
              }
            );
          }

          if (!res.ok) {
            const rawError = (await res.json()) as { error: APIError };
            return rawError.error.message;
          }
        } catch (e) {
          return "An Unknown error occurred while adding data to vault.";
        }
        return null;
      })
    );

    const errors = removeNulls(promisesErrors);
    if (errors.length) {
      sendNotification({
        title: "Error Adding Data to Vault",
        type: "error",
        description: errors[0],
      });
    } else {
      sendNotification({
        title: "Data Successfully Added to Vault",
        type: "success",
        description: "All data sources were successfully updated.",
      });
    }
    await mutateVaultDataSourceViews();
  };

  if (isSystemVaultDataSourceViewsLoading || isVaultDataSourceViewsLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <VaultManagedDataSourcesViewsModal
        isOpen={showDataSourcesModal}
        setOpen={(isOpen) => {
          setShowDataSourcesModal(isOpen);
        }}
        owner={owner}
        systemVaultDataSourceViews={systemVaultDataSourceViews.filter(
          (dsv) =>
            dsv.dataSource.connectorProvider &&
            dsv.dataSource.connectorProvider !== "webcrawler"
        )}
        onSave={async (selectedDataSources) => {
          await updateVaultDataSourceViews(selectedDataSources);
        }}
        initialSelectedDataSources={vaultDataSourceViews}
      />
      <Button
        label="Add data from connections"
        variant="primary"
        icon={PlusIcon}
        size="sm"
        onClick={() => {
          setShowDataSourcesModal(true);
        }}
      />
    </>
  );
}
