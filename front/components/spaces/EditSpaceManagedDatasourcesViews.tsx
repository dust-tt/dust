import {
  Button,
  ContentMessage,
  Dialog,
  InformationCircleIcon,
  PlusIcon,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  APIError,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";

import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import SpaceManagedDatasourcesViewsModal from "@app/components/spaces/SpaceManagedDatasourcesViewsModal";
import { useAwaitableDialog } from "@app/hooks/useAwaitableDialog";
import { getDisplayNameForDataSource, isManaged } from "@app/lib/data_sources";
import {
  useSpaceDataSourceViews,
  useSpaceDataSourceViewsWithDetails,
} from "@app/lib/swr/spaces";

interface EditSpaceManagedDataSourcesViewsProps {
  dataSourceView?: DataSourceViewType;
  isAdmin: boolean;
  onSelectedDataUpdated: () => Promise<void>;
  owner: WorkspaceType;
  systemSpace: SpaceType;
  space: SpaceType;
}

export function EditSpaceManagedDataSourcesViews({
  dataSourceView,
  isAdmin,
  onSelectedDataUpdated,
  owner,
  systemSpace,
  space,
}: EditSpaceManagedDataSourcesViewsProps) {
  const sendNotification = useSendNotification();

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [showNoConnectionDialog, setShowNoConnectionDialog] = useState(false);
  const router = useRouter();

  const { AwaitableDialog, showDialog } = useAwaitableDialog();

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
            dsv.dataSource.sId === dataSourceView.dataSource.sId)
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
          <div className="space-y-4 text-slate-900">
            <p>The following data sources are currently in use:</p>

            {deletedViewsWithUsage.map((view) => (
              <p key={view.sId} className="font-medium">
                {getDisplayNameForDataSource(view.dataSource)}{" "}
                <span className="italic text-slate-500">
                  (used by {view.usage.count} assistant
                  {view.usage.count > 1 ? "s" : ""})
                </span>
              </p>
            ))}

            <ContentMessage
              size="md"
              variant="warning"
              title="Warning"
              icon={InformationCircleIcon}
            >
              <p>
                Deleting these data sources will affect the assistants using
                them. These assistants will no longer have access to this data
                and may not work as expected.
              </p>
            </ContentMessage>

            <p>Are you sure you want to remove them?</p>
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
                  "We should never have a view with no data in the selection, " +
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

  if (isSystemSpaceDataSourceViewsLoading || isSpaceDataSourceViewsLoading) {
    return false;
  }
  return isAdmin ? (
    <>
      <SpaceManagedDatasourcesViewsModal
        space={space}
        isOpen={showDataSourcesModal}
        onClose={() => {
          setShowDataSourcesModal(false);
        }}
        owner={owner}
        systemSpaceDataSourceViews={filterSystemSpaceDataSourceViews}
        onSave={async (selectionConfigurations) => {
          await updateSpaceDataSourceViews(selectionConfigurations);
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
            `/w/${owner.sId}/spaces/${systemSpace.sId}/categories/managed`
          );
        }}
        title="No connection set up"
      >
        <p>You have no connection set up.</p>
      </Dialog>
      <AwaitableDialog />
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
          if (systemSpaceDataSourceViews.length === 0) {
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
