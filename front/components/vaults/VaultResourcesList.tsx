import {
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  DataTable,
  FolderIcon,
  PencilSquareIcon,
  Searchbar,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  APIError,
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  DataSourceViewCategory,
  DataSourceViewWithConnectorType,
  PlanType,
  UpdateConnectorRequestBody,
  UserType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { CONNECTOR_TYPE_TO_MISMATCH_ERROR } from "@dust-tt/types";
import { isWebsiteOrFolder } from "@dust-tt/types";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useContext } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import { ConnectorPermissionsModal } from "@app/components/ConnectorPermissionsModal";
import { DataSourceEditionModal } from "@app/components/data_source/DataSourceEditionModal";
import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { AddConnectionMenu } from "@app/components/vaults/AddConnectionMenu";
import { EditVaultManagedDataSourcesViews } from "@app/components/vaults/EditVaultManagedDatasourcesViews";
import { EditVaultStaticDatasourcesViews } from "@app/components/vaults/EditVaultStaticDatasourcesViews";
import {
  getConnectorProviderLogoWithFallback,
  getDataSourceNameFromView,
} from "@app/lib/connector_providers";
import { useDataSources } from "@app/lib/swr/data_sources";
import { useVaultDataSourceViews } from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";
import { setupConnection } from "@app/pages/w/[wId]/builder/data-sources/managed";

const REDIRECT_TO_EDIT_PERMISSIONS = [
  "confluence",
  "google_drive",
  "microsoft",
  "slack",
  "intercom",
];

type RowData = {
  dataSourceView: DataSourceViewWithConnectorType;
  label: string;
  icon: ComponentType;
  workspaceId: string;
  isAdmin: boolean;
  isLoading?: boolean;
  buttonOnClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
};

type VaultResourcesListProps = {
  dustClientFacingUrl: string;
  owner: WorkspaceType;
  user: UserType;
  plan: PlanType;
  isAdmin: boolean;
  canWriteInVault: boolean;
  vault: VaultType;
  systemVault: VaultType;
  category: DataSourceViewCategory;
  onSelect: (sId: string) => void;
};

const getTableColumns = ({
  isManaged,
  isSystemVault,
}: {
  isManaged: boolean;
  isSystemVault: boolean;
}) => {
  const nameColumn: ColumnDef<RowData, string> = {
    header: "Name",
    accessorKey: "label",
    id: "name",
    sortingFn: "text", // built-in sorting function case-insensitive
    cell: (info: CellContext<RowData, string>) => (
      <DataTable.CellContent icon={info.row.original.icon}>
        <span className="font-bold"> {info.getValue()}</span>
      </DataTable.CellContent>
    ),
  };

  const managedByColumn = {
    header: "Managed by",
    accessorFn: (row: RowData) =>
      (row.dataSourceView.kind === "default"
        ? row.dataSourceView.dataSource.editedByUser?.imageUrl
        : row.dataSourceView.editedByUser?.imageUrl) ?? "",
    id: "managedBy",
    cell: (info: CellContext<RowData, string>) => (
      <DataTable.CellContent avatarUrl={info.getValue()} roundedAvatar={true} />
    ),
  };

  const lastSyncedColumn = {
    header: "Last sync",
    accessorFn: (row: RowData) =>
      row.dataSourceView.dataSource.connector?.lastSyncSuccessfulTime,
    cell: (info: CellContext<RowData, number>) => (
      <DataTable.CellContent className="pr-2">
        <>
          {!info.row.original.dataSourceView.dataSource.connector &&
            !info.row.original.dataSourceView.dataSource
              .fetchConnectorError && <Chip color="amber">Never</Chip>}
          {info.row.original.dataSourceView.dataSource.fetchConnectorError && (
            <Chip color="warning">
              Error loading the connector. Try again in a few minutes.
            </Chip>
          )}
          {info.row.original.dataSourceView.dataSource.connector &&
            info.row.original.workspaceId &&
            info.row.original.dataSourceView.dataSource.name && (
              <ConnectorSyncingChip
                initialState={
                  info.row.original.dataSourceView.dataSource.connector
                }
                workspaceId={info.row.original.workspaceId}
                dataSourceId={info.row.original.dataSourceView.dataSource.sId}
              />
            )}
        </>
      </DataTable.CellContent>
    ),
  };

  const actionColumn = {
    id: "action",
    cell: (info: CellContext<RowData, unknown>) => {
      const original = info.row.original;
      const disabled = original.isLoading || !original.isAdmin;

      if (!original.dataSourceView.dataSource.connector) {
        return (
          <DataTable.CellContent>
            <Button
              variant="primary"
              icon={CloudArrowLeftRightIcon}
              disabled={disabled}
              onClick={original.buttonOnClick}
              label={original.isLoading ? "Connecting..." : "Connect"}
            />
          </DataTable.CellContent>
        );
      } else {
        return (
          <DataTable.CellContent>
            <Button
              variant="secondary"
              icon={Cog6ToothIcon}
              disabled={disabled}
              onClick={original.buttonOnClick}
              label={original.isAdmin ? "Manage" : "View"}
            />
          </DataTable.CellContent>
        );
      }
    },
  };

  // TODO(GROUPS_UI) Add usage column.
  if (isSystemVault && isManaged) {
    return [nameColumn, managedByColumn, lastSyncedColumn, actionColumn];
  }
  return isManaged
    ? [nameColumn, managedByColumn, lastSyncedColumn]
    : [nameColumn, managedByColumn];
};

export const VaultResourcesList = ({
  owner,
  user,
  plan,
  isAdmin,
  canWriteInVault,
  dustClientFacingUrl,
  vault,
  systemVault,
  category,
  onSelect,
}: VaultResourcesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [showEditionModal, setShowEditionModal] = useState(false);
  const [showConnectorPermissionsModal, setShowConnectorPermissionsModal] =
    useState(false);
  const [selectedDataSourceView, setSelectedDataSourceView] =
    useState<DataSourceViewWithConnectorType | null>(null);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [showFolderOrWebsiteModal, setShowFolderOrWebsiteModal] =
    useState(false);
  const [isNewConnectorLoading, setIsNewConnectorLoading] = useState(false);
  const { dataSources, isDataSourcesLoading } = useDataSources(owner);
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  const searchBarRef = useRef<HTMLInputElement>(null);

  const isSystemVault = systemVault.sId === vault.sId;
  const isManaged = category === "managed";
  const isStatic = isWebsiteOrFolder(category);

  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Partial<Record<ConnectorProvider, boolean>>
  >({});

  const handleUpdatePermissions = async (
    connector: ConnectorType,
    dataSource: DataSourceType
  ) => {
    const provider = connector.type;

    const connectionIdRes = await setupConnection({
      dustClientFacingUrl,
      owner,
      provider,
    });
    if (connectionIdRes.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to update the permissions of the Data Source",
        description: connectionIdRes.error.message,
      });
      return;
    }

    const updateRes = await updateConnectorConnectionId(
      connectionIdRes.value,
      provider,
      dataSource
    );
    if (updateRes.error) {
      sendNotification({
        type: "error",
        title: "Failed to update the permissions of the Data Source",
        description: updateRes.error,
      });
      return;
    }
  };

  const updateConnectorConnectionId = async (
    newConnectionId: string,
    provider: string,
    dataSource: DataSourceType
  ) => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/update`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId: newConnectionId,
        } satisfies UpdateConnectorRequestBody),
      }
    );

    if (res.ok) {
      return { success: true, error: null };
    }

    const jsonErr = await res.json();
    const error = jsonErr.error;

    if (error.type === "connector_oauth_target_mismatch") {
      return {
        success: false,
        error: CONNECTOR_TYPE_TO_MISMATCH_ERROR[provider as ConnectorProvider],
      };
    }
    return {
      success: false,
      error: `Failed to update the permissions of the Data Source: (contact support@dust.tt for assistance)`,
    };
  };

  // DataSources Views of the current vault.
  const {
    vaultDataSourceViews,
    isVaultDataSourceViewsLoading,
    mutateVaultDataSourceViews,
  } = useVaultDataSourceViews({
    workspaceId: owner.sId,
    vaultId: vault.sId,
    category: category,
    includeEditedBy: true,
    includeConnectorDetails: true,
  });

  const rows: RowData[] =
    vaultDataSourceViews?.map((r) => ({
      dataSourceView: r,
      label: getDataSourceNameFromView(r),
      icon: getConnectorProviderLogoWithFallback(
        r.dataSource.connectorProvider,
        FolderIcon
      ),
      workspaceId: owner.sId,
      isAdmin,
      isLoading: isLoadingByProvider[r.dataSource.connectorProvider],
      ...(isStatic && {
        moreMenuItems: [
          {
            label: "Edit",
            icon: PencilSquareIcon,
            onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
              e.stopPropagation();
              setSelectedDataSourceView(r);
              setShowFolderOrWebsiteModal(true);
            },
          },
          {
            label: "Delete",
            icon: TrashIcon,
            variant: "warning",
            onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
              e.stopPropagation();
              setSelectedDataSourceView(r);
              setShowDeleteConfirmDialog(true);
            },
          },
        ],
      }),
      buttonOnClick: (e) => {
        e.stopPropagation();
        setShowConnectorPermissionsModal(true);
        setSelectedDataSourceView(r);
      },
      onClick: () => onSelect(r.sId),
    })) || [];

  if (
    isDataSourcesLoading ||
    isVaultDataSourceViewsLoading ||
    isNewConnectorLoading
  ) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const onDeleteFolderOrWebsite = async () => {
    if (!selectedDataSourceView) {
      return;
    }
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources/${selectedDataSourceView.dataSource.name}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      await router.push(
        `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${selectedDataSourceView.category}`
      );
      sendNotification({
        type: "success",
        title: `Successfully deleted ${selectedDataSourceView.category}`,
        description: `${getDataSourceNameFromView(selectedDataSourceView)} was successfully deleted.`,
      });
    } else {
      const err: { error: APIError } = await res.json();
      sendNotification({
        type: "error",
        title: `Error deleting ${selectedDataSourceView.category}`,
        description: `Error: ${err.error.message}`,
      });
    }
    return res.ok;
  };

  return (
    <>
      <div
        className={classNames(
          "flex gap-2",
          rows.length === 0
            ? "h-36 w-full max-w-4xl items-center justify-center rounded-lg border bg-structure-50"
            : ""
        )}
      >
        {rows.length > 0 && (
          <Searchbar
            name="search"
            ref={searchBarRef}
            placeholder="Search (Name)"
            value={dataSourceSearch}
            onChange={(s) => {
              setDataSourceSearch(s);
            }}
          />
        )}
        {isSystemVault && category === "managed" && (
          <div className="flex items-center justify-center text-sm font-normal text-element-700">
            <AddConnectionMenu
              owner={owner}
              dustClientFacingUrl={dustClientFacingUrl}
              plan={plan}
              existingDataSources={vaultDataSourceViews.map(
                (v) => v.dataSource
              )}
              setIsProviderLoading={(provider, isLoading) => {
                setIsNewConnectorLoading(true);
                setIsLoadingByProvider((prev) => ({
                  ...prev,
                  [provider]: isLoading,
                }));
              }}
              onCreated={async (dataSource) => {
                const updateDataSourceViews =
                  await mutateVaultDataSourceViews();
                if (
                  dataSource.connectorProvider &&
                  REDIRECT_TO_EDIT_PERMISSIONS.includes(
                    dataSource.connectorProvider
                  )
                ) {
                  if (updateDataSourceViews) {
                    const view = updateDataSourceViews.dataSourceViews.find(
                      (v) => v.dataSource.sId === dataSource.sId
                    );
                    if (view) {
                      setSelectedDataSourceView(view);
                      setShowConnectorPermissionsModal(true);
                    }
                  }
                }
                setIsNewConnectorLoading(false);
              }}
            />
          </div>
        )}
        {!isSystemVault && isManaged && (
          <EditVaultManagedDataSourcesViews
            owner={owner}
            vault={vault}
            systemVault={systemVault}
            isAdmin={isAdmin}
          />
        )}
        {isStatic && (
          <>
            <EditVaultStaticDatasourcesViews
              isOpen={showFolderOrWebsiteModal}
              setOpen={setShowFolderOrWebsiteModal}
              owner={owner}
              vault={vault}
              canWriteInVault={canWriteInVault}
              dataSources={dataSources}
              dataSourceView={selectedDataSourceView}
              plan={plan}
              category={category}
              onClose={() => {
                setShowFolderOrWebsiteModal(false);
                setSelectedDataSourceView(null);
              }}
            />
            {selectedDataSourceView && (
              <DeleteStaticDataSourceDialog
                handleDelete={onDeleteFolderOrWebsite}
                isOpen={showDeleteConfirmDialog}
                onClose={() => setShowDeleteConfirmDialog(false)}
              />
            )}
          </>
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns({ isManaged, isSystemVault })}
          filter={dataSourceSearch}
          filterColumn="name"
          initialColumnOrder={[{ desc: false, id: "name" }]}
        />
      )}
      {selectedDataSourceView &&
        selectedDataSourceView.dataSource.connector && (
          <>
            <ConnectorPermissionsModal
              owner={owner}
              connector={selectedDataSourceView.dataSource.connector}
              dataSource={selectedDataSourceView.dataSource}
              isOpen={showConnectorPermissionsModal && !!selectedDataSourceView}
              onClose={() => {
                setShowConnectorPermissionsModal(false);
              }}
              setShowEditionModal={setShowEditionModal}
              handleUpdatePermissions={handleUpdatePermissions}
              plan={plan}
              readOnly={false}
              isAdmin={isAdmin}
            />
            <DataSourceEditionModal
              isOpen={showEditionModal}
              onClose={() => setShowEditionModal(false)}
              dataSource={selectedDataSourceView.dataSource}
              owner={owner}
              user={user}
              onEditPermissionsClick={() => {
                if (!selectedDataSourceView?.dataSource.connector) {
                  return;
                }
                void handleUpdatePermissions(
                  selectedDataSourceView.dataSource.connector,
                  selectedDataSourceView.dataSource
                );
              }}
              dustClientFacingUrl={dustClientFacingUrl}
            />
          </>
        )}
    </>
  );
};
