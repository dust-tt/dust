import { Button, Dialog, PlusIcon } from "@dust-tt/sparkle";
import type {
  APIError,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";

import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import VaultManagedDataSourcesViewsModal from "@app/components/vaults/VaultManagedDatasourcesViewsModal";
import { isManaged } from "@app/lib/data_sources";
import {
  useVaultDataSourceViews,
  useVaultDataSourceViewsWithDetails,
} from "@app/lib/swr/vaults";

interface EditVaultManagedDataSourcesViewsProps {
  isAdmin: boolean;
  owner: WorkspaceType;
  systemVault: VaultType;
  vault: VaultType;
  dataSourceView?: DataSourceViewType;
}

export function EditVaultManagedDataSourcesViews({
  isAdmin,
  owner,
  systemVault,
  vault,
  dataSourceView,
}: EditVaultManagedDataSourcesViewsProps) {
  const sendNotification = React.useContext(SendNotificationsContext);

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [showNoConnectionDialog, setShowNoConnectionDialog] = useState(false);
  const router = useRouter();

  // DataSources Views of the current vault.
  const {
    vaultDataSourceViews,
    isVaultDataSourceViewsLoading,
    mutateRegardlessOfQueryParams: mutateVaultDataSourceViews,
  } = useVaultDataSourceViewsWithDetails({
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
    disabled: !isAdmin,
  });
  const filteredSystemVaultDataSourceViews = useMemo(
    () =>
      systemVaultDataSourceViews.filter(
        (dsv) =>
          isManaged(dsv.dataSource) &&
          (!dataSourceView ||
            dsv.dataSource.sId === dataSourceView.dataSource.sId)
      ),
    [systemVaultDataSourceViews, dataSourceView]
  );

  const filteredDataSourceViews = vaultDataSourceViews.filter(
    (dsv) => !dataSourceView || dsv.sId === dataSourceView.sId
  );

  const updateVaultDataSourceViews = async (
    selectionConfigurations: DataSourceViewSelectionConfigurations
  ) => {
    // Check if a data source view in the vault is no longer in the selection configurations by
    // comparing the data source.  If so, delete it.
    const deletedViews = filteredDataSourceViews.filter(
      (dsv) =>
        !Object.values(selectionConfigurations).find(
          (sc) => sc.dataSourceView.dataSource.sId === dsv.dataSource.sId
        )
    );

    const deletePromisesErrors = await Promise.all(
      deletedViews.map(async (deletedView) => {
        try {
          const res = await fetch(
            `/api/w/${owner.sId}/vaults/${vault.sId}/data_source_views/${deletedView.sId}`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );
          if (!res.ok) {
            const rawError: { error: APIError } = await res.json();
            return rawError.error.message;
          }
        } catch (e) {
          return `${e}`;
        }
        return null;
      })
    );

    const upsertPromisesErors = await Promise.all(
      Object.values(selectionConfigurations).map(
        async (selectionConfiguration) => {
          const {
            dataSourceView: { dataSource: sDs },
          } = selectionConfiguration;

          const existingViewForDs = filteredDataSourceViews.find(
            (d) => d.dataSource.sId === sDs.sId
          );

          const body = {
            dataSourceId: sDs.sId,
            parentsIn: selectionConfiguration.isSelectAll
              ? null
              : selectionConfiguration.selectedResources.map(
                  (r) => r.internalId
                ),
          };

          try {
            let res;
            if (existingViewForDs) {
              if (
                !selectionConfiguration.isSelectAll &&
                selectionConfiguration.selectedResources.length === 0
              ) {
                throw new Error(
                  "We should never have a view with no data in the selection, " +
                    "it should have been removed. Action: check the DataSourceViewSelector component."
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
              const rawError: { error: APIError } = await res.json();
              return rawError.error.message;
            }
          } catch (e) {
            return `An Unknown error ${e} occurred while adding data to vault.`;
          }
          return null;
        }
      )
    );

    const errors = removeNulls(
      deletePromisesErrors.concat(upsertPromisesErors)
    );
    if (errors.length) {
      sendNotification({
        title: "Error Adding Data to Vault",
        type: "error",
        description: errors[0],
      });
    } else {
      sendNotification({
        title: "Data Successfully Updated",
        type: "success",
        description: "All data sources were successfully updated in the Vault.",
      });
    }
    await mutateVaultDataSourceViews();
  };

  if (isSystemVaultDataSourceViewsLoading || isVaultDataSourceViewsLoading) {
    return false;
  }
  return isAdmin ? (
    <>
      <VaultManagedDataSourcesViewsModal
        vault={vault}
        isOpen={showDataSourcesModal}
        onClose={() => {
          setShowDataSourcesModal(false);
        }}
        owner={owner}
        systemVaultDataSourceViews={filteredSystemVaultDataSourceViews}
        onSave={async (selectionConfigurations) => {
          await updateVaultDataSourceViews(selectionConfigurations);
        }}
        initialSelectedDataSources={filteredDataSourceViews}
      />
      <Dialog
        isOpen={showNoConnectionDialog}
        onCancel={() => setShowNoConnectionDialog(false)}
        cancelLabel="Close"
        validateLabel="Go to connections management"
        onValidate={() => {
          void router.push(
            `/w/${owner.sId}/vaults/${systemVault.sId}/categories/managed`
          );
        }}
        title="No connection set up"
      >
        <p>You have no connection set up.</p>
      </Dialog>
      <Button
        label="Add data from connections"
        variant="primary"
        icon={PlusIcon}
        size="sm"
        onClick={() => {
          if (systemVaultDataSourceViews.length === 0) {
            setShowNoConnectionDialog(true);
          } else {
            setShowDataSourcesModal(true);
          }
        }}
      />
    </>
  ) : (
    <RequestDataSourceModal
      dataSources={filteredDataSourceViews.map((view) => view.dataSource)}
      owner={owner}
    />
  );
}
