import {
  Button,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InformationCircleIcon,
  PlusIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { confirmPrivateNodesSync } from "@app/components/data_source/ConnectorPermissionsModal";
import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import SpaceManagedDatasourcesViewsModal from "@app/components/spaces/SpaceManagedDatasourcesViewsModal";
import { useAwaitableDialog } from "@app/hooks/useAwaitableDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { getDisplayNameForDataSource, isManaged } from "@app/lib/data_sources";
import { useKillSwitches } from "@app/lib/swr/kill";
import {
  useSpaceDataSourceViews,
  useSpaceDataSourceViewsWithDetails,
} from "@app/lib/swr/spaces";
import type {
  APIError,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  SpaceType,
  WorkspaceType,
} from "@app/types";
import { removeNulls } from "@app/types";

interface EditSpaceManagedDataSourcesViewsProps {
  dataSourceView?: DataSourceViewType;
  isAdmin: boolean;
  onSelectedDataUpdated: () => Promise<void>;
  owner: WorkspaceType;
  systemSpace: SpaceType;
  space: SpaceType;
  shouldOpenModal?: boolean;
  onOpenModalHandled?: () => void;
}

/*
 * If you pass a dataSourceView to this component, it will be used to edit the data source view selection.
 * If you don't pass a dataSourceView, it will allow you to edit data from multiple data sources at once.
 */
export function EditSpaceManagedDataSourcesViews({
  dataSourceView,
  isAdmin,
  onSelectedDataUpdated,
  owner,
  systemSpace,
  space,
  shouldOpenModal,
  onOpenModalHandled,
}: EditSpaceManagedDataSourcesViewsProps) {
  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [showNoConnectionDialog, setShowNoConnectionDialog] = useState(false);
  const router = useRouter();

  const { AwaitableDialog, showDialog } = useAwaitableDialog();

  const { killSwitches } = useKillSwitches();

  const isSavingDisabled = killSwitches?.includes("save_data_source_views");

  // DataSources Views of the current space.
  const {
    spaceDataSourceViews,
    isSpaceDataSourceViewsLoading,
    mutateRegardlessOfQueryParams: mutateSpaceDataSourceViews,
  } = useSpaceDataSourceViewsWithDetails({
    workspaceId: owner.sId,
    spaceId: space.sId,
    category: "managed",
  });

  // DataSources Views of the system space holding the managed datasources we want to select data from.
  const {
    spaceDataSourceViews: systemSpaceDataSourceViews,
    isSpaceDataSourceViewsLoading: isSystemSpaceDataSourceViewsLoading,
  } = useSpaceDataSourceViews({
    workspaceId: owner.sId,
    spaceId: systemSpace.sId,
    category: "managed",
    disabled: !isAdmin,
  });
  const filterSystemSpaceDataSourceViews = useMemo(
    () =>
      systemSpaceDataSourceViews.filter(
        (dsv) =>
          isManaged(dsv.dataSource) &&
          (!dataSourceView ||
            dsv.dataSource.sId === dataSourceView.dataSource.sId) &&
          dsv.dataSource.connectorProvider !== "slack_bot"
      ),
    [systemSpaceDataSourceViews, dataSourceView]
  );

  const filteredDataSourceViews = spaceDataSourceViews.filter(
    (dsv) => !dataSourceView || dsv.sId === dataSourceView.sId
  );

  const updateSpaceDataSourceViews = async (
    selectionConfigurations: DataSourceViewSelectionConfigurations
  ) => {
    // Check if a data source view in the space is no longer in the selection configurations by
    // comparing the data source.  If so, delete it.
    const deletedViews = filteredDataSourceViews.filter(
      (dsv) =>
        !Object.values(selectionConfigurations).find(
          (sc) => sc.dataSourceView.dataSource.sId === dsv.dataSource.sId
        )
    );

    const deletedViewsWithUsage = deletedViews.filter(
      (dv) => dv.usage.count > 0
    );
    if (deletedViewsWithUsage.length > 0) {
      const confirmed = await showDialog({
        title: "Data sources in use",
        validateLabel: "Delete anyway",
        cancelLabel: "Cancel",
        validateVariant: "warning",
        alertDialog: true,
        children: (
          <div className="space-y-4 text-foreground">
            <ContentMessage
              size="md"
              variant="warning"
              title="Warning"
              icon={InformationCircleIcon}
            >
              Deleting these data sources will affect the agents using them.
              These agents will no longer have access to this data and may not
              work as expected.
            </ContentMessage>

            <div>
              The following data sources are currently in use:
              <ul className="ml-6 list-disc">
                {deletedViewsWithUsage.map((view) => (
                  <li key={view.sId} className="font-medium">
                    {getDisplayNameForDataSource(view.dataSource)}{" "}
                    <span className="italic text-muted-foreground">
                      (used by {view.usage.count} agent
                      {view.usage.count > 1 ? "s" : ""})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="font-semibold">
              Are you sure you want to remove them?
            </div>
          </div>
        ),
      });

      if (!confirmed) {
        return;
      }
    }

    const deletePromisesErrors = await Promise.all(
      deletedViews.map(async (deletedView) => {
        try {
          const res = await fetch(
            `/api/w/${owner.sId}/spaces/${space.sId}/data_source_views/${deletedView.sId}?force=true`,
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
                  `We should never have a view with no data in the selection (${existingViewForDs.dataSource.name}), ` +
                    "it should have been removed. Action: check the DataSourceViewSelector component."
                );
              } else {
                res = await fetch(
                  `/api/w/${owner.sId}/spaces/${space.sId}/data_source_views/${existingViewForDs.sId}`,
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
                `/api/w/${owner.sId}/spaces/${space.sId}/data_source_views`,
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
            return `An Unknown error ${e} occurred while adding data to space.`;
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
        title: "Error Adding Data to Space",
        type: "error",
        description: errors[0],
      });
    } else {
      sendNotification({
        title: "Data Successfully Updated",
        type: "success",
        description: "All data sources were successfully updated in the Space.",
      });
    }

    await mutateSpaceDataSourceViews();
    await onSelectedDataUpdated();
  };

  const openAddDataModal = useCallback(() => {
    if (systemSpaceDataSourceViews.length === 0) {
      setShowNoConnectionDialog(true);
    } else {
      setShowDataSourcesModal(true);
    }
  }, [systemSpaceDataSourceViews.length]);

  useEffect(() => {
    // If the modal should be opened (from query param for instance) we wait for the data to be loaded
    // before opening it.
    if (!shouldOpenModal) {
      return;
    }
    if (isSystemSpaceDataSourceViewsLoading || isSpaceDataSourceViewsLoading) {
      return;
    }
    openAddDataModal();
    onOpenModalHandled?.();
  }, [
    shouldOpenModal,
    isSystemSpaceDataSourceViewsLoading,
    isSpaceDataSourceViewsLoading,
    openAddDataModal,
    onOpenModalHandled,
  ]);

  if (isSystemSpaceDataSourceViewsLoading || isSpaceDataSourceViewsLoading) {
    return false;
  }

  function handleCloseDataSourcesModal() {
    setShowDataSourcesModal(false);
  }

  function handleGoToConnectionsManagement() {
    void router.push(
      `/w/${owner?.sId}/spaces/${systemSpace?.sId}/categories/managed`
    );
  }

  const addToSpaceButton = (
    <Button
      label={
        dataSourceView
          ? `Add data from ${getDisplayNameForDataSource(dataSourceView.dataSource)}`
          : "Add data from connections"
      }
      variant="primary"
      icon={PlusIcon}
      size="sm"
      onClick={() => {
        openAddDataModal();
      }}
      disabled={isSavingDisabled}
    />
  );

  return isAdmin ? (
    <>
      <SpaceManagedDatasourcesViewsModal
        space={space}
        systemSpace={systemSpace}
        isOpen={showDataSourcesModal}
        onClose={() => {
          setShowDataSourcesModal(false);
        }}
        owner={owner}
        systemSpaceDataSourceViews={filterSystemSpaceDataSourceViews}
        onSave={async (selectionConfigurations) => {
          const selectedNodes = Object.values(selectionConfigurations)
            .map((sc) => sc.selectedResources)
            .flat();

          const syncConfirmed = await confirmPrivateNodesSync({
            selectedNodes,
            confirm,
          });

          if (!syncConfirmed) {
            return;
          }

          await updateSpaceDataSourceViews(selectionConfigurations);
        }}
        initialSelectedDataSources={filteredDataSourceViews}
      />

      <Dialog
        open={showNoConnectionDialog}
        onOpenChange={(open) => !open && setShowNoConnectionDialog(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No connection set up</DialogTitle>
          </DialogHeader>
          <DialogContainer>You have no connection set up.</DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: handleCloseDataSourcesModal,
            }}
            rightButtonProps={{
              label: "Go to connections management",
              variant: "primary",
              onClick: handleGoToConnectionsManagement,
            }}
          />
        </DialogContent>
      </Dialog>
      <AwaitableDialog />
      {isSavingDisabled ? (
        <Tooltip
          trigger={addToSpaceButton}
          label="Editing spaces is temporarily disabled and will be re-enabled shortly."
        />
      ) : (
        addToSpaceButton
      )}
    </>
  ) : (
    <RequestDataSourceModal
      dataSources={filteredDataSourceViews.map((view) => view.dataSource)}
      owner={owner}
    />
  );
}
