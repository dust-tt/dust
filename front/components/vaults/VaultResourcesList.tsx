import {
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  CubeIcon,
  DataTable,
  FolderIcon,
  PencilSquareIcon,
  RobotIcon,
  Searchbar,
  Spinner,
  TrashIcon,
  usePaginationFromUrl,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceViewCategory,
  DataSourceViewsWithDetails,
  DataSourceViewType,
  DataSourceWithAgentsUsageType,
  DataSourceWithConnectorDetailsType,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { isWebsiteOrFolderCategory } from "@dust-tt/types";
import type {
  CellContext,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import { ConnectorPermissionsModal } from "@app/components/ConnectorPermissionsModal";
import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import type { DataSourceIntegration } from "@app/components/vaults/AddConnectionMenu";
import { AddConnectionMenu } from "@app/components/vaults/AddConnectionMenu";
import { EditVaultManagedDataSourcesViews } from "@app/components/vaults/EditVaultManagedDatasourcesViews";
import { EditVaultStaticDatasourcesViews } from "@app/components/vaults/EditVaultStaticDatasourcesViews";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getDataSourceNameFromView, isManaged } from "@app/lib/data_sources";
import { useDataSources } from "@app/lib/swr/data_sources";
import {
  useDeleteFolderOrWebsite,
  useVaultDataSourceViewsWithDetails,
} from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";

import { ViewFolderAPIModal } from "../ViewFolderAPIModal";

const REDIRECT_TO_EDIT_PERMISSIONS = [
  "confluence",
  "google_drive",
  "microsoft",
  "slack",
  "intercom",
  "snowflake",
];

type RowData = {
  dataSourceView: DataSourceViewsWithDetails;
  label: string;
  icon: ComponentType;
  workspaceId: string;
  isAdmin: boolean;
  isLoading?: boolean;
  buttonOnClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
};

type VaultResourcesListProps = {
  owner: WorkspaceType;
  plan: PlanType;
  isAdmin: boolean;
  canWriteInVault: boolean;
  vault: VaultType;
  systemVault: VaultType;
  category: Exclude<DataSourceViewCategory, "apps">;
  onSelect: (sId: string) => void;
  integrations: DataSourceIntegration[];
};

const getTableColumns = ({
  isManaged,
  isWebsite,
  vault,
}: {
  isManaged: boolean;
  isWebsite: boolean;
  vault: VaultType;
}) => {
  const nameColumn: ColumnDef<RowData, string> = {
    header: "Name",
    accessorKey: "label",
    id: "name",
    sortingFn: "text", // built-in sorting function case-insensitive
    cell: (info: CellContext<RowData, string>) => (
      <DataTable.CellContent icon={info.row.original.icon}>
        <span>{info.getValue()}</span>
      </DataTable.CellContent>
    ),
  };

  const isGlobalOrSystemVault = ["global", "system"].includes(vault.kind);

  const managedByColumn = {
    header: "Managed by",
    accessorFn: (row: RowData) =>
      isGlobalOrSystemVault
        ? row.dataSourceView.dataSource.editedByUser?.imageUrl
        : row.dataSourceView.editedByUser?.imageUrl,
    meta: {
      width: "6rem",
    },
    id: "managedBy",
    accessorKey: "managedBy",
    cell: (info: CellContext<RowData, string>) => {
      const dsv = info.row.original.dataSourceView;
      const editedByUser = isGlobalOrSystemVault
        ? dsv.dataSource.editedByUser
        : dsv.editedByUser;

      return (
        <DataTable.CellContent
          avatarUrl={info.getValue()}
          avatarTooltipLabel={editedByUser?.fullName ?? undefined}
          roundedAvatar={true}
        />
      );
    },
  };

  const usedByColumn = {
    header: "Used by",
    accessorFn: (row: RowData) => row.dataSourceView.usage?.count ?? 0,
    id: "usedBy",
    meta: {
      width: "6rem",
    },
    cell: (info: CellContext<RowData, DataSourceWithAgentsUsageType>) => (
      <>
        {info.row.original.dataSourceView.usage ? (
          <DataTable.CellContent
            icon={RobotIcon}
            title={`Used by ${info.row.original.dataSourceView.usage.agentNames.join(
              ", "
            )}`}
          >
            {info.row.original.dataSourceView.usage.count}
          </DataTable.CellContent>
        ) : null}
      </>
    ),
  };

  const lastSyncedColumn = {
    header: "Last sync",
    id: "lastSync",
    accessorFn: (row: RowData) =>
      row.dataSourceView.dataSource.connector?.lastSyncSuccessfulTime,
    meta: {
      width: "14rem",
    },
    cell: (info: CellContext<RowData, number>) => (
      <DataTable.CellContent className="pr-2">
        <>
          {!info.row.original.dataSourceView.dataSource.connector &&
            !info.row.original.dataSourceView.dataSource
              .fetchConnectorError && <Chip color="amber">Never</Chip>}
          {info.row.original.dataSourceView.dataSource.fetchConnectorError && (
            <Chip color="warning">Retry in a few minutes</Chip>
          )}
          {info.row.original.dataSourceView.dataSource.connector &&
            info.row.original.workspaceId &&
            info.row.original.dataSourceView.dataSource.name && (
              <ConnectorSyncingChip
                initialState={
                  info.row.original.dataSourceView.dataSource.connector
                }
                workspaceId={info.row.original.workspaceId}
                dataSource={info.row.original.dataSourceView.dataSource}
              />
            )}
        </>
      </DataTable.CellContent>
    ),
  };

  const actionColumn = {
    id: "action",
    meta: {
      width: "10rem",
    },
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
              hasMagnifying={false}
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
              hasMagnifying={false}
              onClick={original.buttonOnClick}
              label={original.isAdmin ? "Manage" : "View"}
            />
          </DataTable.CellContent>
        );
      }
    },
  };

  if (vault.kind === "system" && isManaged) {
    return [
      nameColumn,
      usedByColumn,
      managedByColumn,
      lastSyncedColumn,
      actionColumn,
    ];
  }
  return isManaged || isWebsite
    ? [nameColumn, usedByColumn, managedByColumn, lastSyncedColumn]
    : [nameColumn, usedByColumn, managedByColumn];
};

export const VaultResourcesList = ({
  owner,
  plan,
  isAdmin,
  canWriteInVault,
  vault,
  systemVault,
  category,
  onSelect,
  integrations,
}: VaultResourcesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [showConnectorPermissionsModal, setShowConnectorPermissionsModal] =
    useState(false);
  const [selectedDataSourceView, setSelectedDataSourceView] =
    useState<DataSourceViewsWithDetails | null>(null);

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [showFolderOrWebsiteModal, setShowFolderOrWebsiteModal] =
    useState(false);
  const [showViewFolderAPIModal, setShowViewFolderAPIModal] = useState(false);
  const [isNewConnectorLoading, setIsNewConnectorLoading] = useState(false);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const { dataSources, isDataSourcesLoading } = useDataSources(owner);
  const router = useRouter();

  const searchBarRef = useRef<HTMLInputElement>(null);

  const isSystemVault = systemVault.sId === vault.sId;
  const isManagedCategory = category === "managed";
  const isWebsite = category === "website";
  const isFolder = category === "folder";
  const isWebsiteOrFolder = isWebsiteOrFolderCategory(category);

  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Partial<Record<ConnectorProvider, boolean>>
  >({});

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });

  const doDelete = useDeleteFolderOrWebsite({
    owner,
    vaultId: vault.sId,
    category,
  });

  // DataSources Views of the current vault.
  const {
    vaultDataSourceViews,
    isVaultDataSourceViewsLoading,
    mutateRegardlessOfQueryParams: mutateVaultDataSourceViews,
  } = useVaultDataSourceViewsWithDetails({
    workspaceId: owner.sId,
    vaultId: vault.sId,
    category: category,
  });

  const rows: RowData[] = useMemo(
    () =>
      vaultDataSourceViews?.map((dataSourceView) => {
        const moreMenuItems = [];
        if (isWebsiteOrFolder && canWriteInVault) {
          moreMenuItems.push({
            label: "Edit",
            icon: PencilSquareIcon,
            onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
              e.stopPropagation();
              setSelectedDataSourceView(dataSourceView);
              setShowFolderOrWebsiteModal(true);
            },
          });
          if (isFolder) {
            moreMenuItems.push({
              label: "API",
              icon: CubeIcon,
              onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
                e.stopPropagation();
                setSelectedDataSourceView(dataSourceView);
                setShowViewFolderAPIModal(true);
              },
            });
          }
          moreMenuItems.push({
            label: "Delete",
            icon: TrashIcon,
            variant: "warning",
            onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
              e.stopPropagation();
              setSelectedDataSourceView(dataSourceView);
              setShowDeleteConfirmDialog(true);
            },
          });
        }
        const provider = dataSourceView.dataSource.connectorProvider;

        return {
          dataSourceView,
          label: getDataSourceNameFromView(dataSourceView),
          icon: getConnectorProviderLogoWithFallback(provider, FolderIcon),
          workspaceId: owner.sId,
          isAdmin,
          isLoading: provider ? isLoadingByProvider[provider] : false,
          moreMenuItems,
          buttonOnClick: (e) => {
            e.stopPropagation();
            setSelectedDataSourceView(dataSourceView);
            setShowConnectorPermissionsModal(true);
          },
          onClick: () => onSelect(dataSourceView.sId),
        };
      }) || [],
    [
      isLoadingByProvider,
      onSelect,
      owner,
      vaultDataSourceViews,
      isAdmin,
      isFolder,
      isWebsiteOrFolder,
      canWriteInVault,
    ]
  );

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
    if (selectedDataSourceView?.dataSource) {
      const res = await doDelete(selectedDataSourceView);
      if (res) {
        await router.push(
          `/w/${owner.sId}/vaults/${vault.sId}/categories/${selectedDataSourceView.category}`
        );
      }
    }
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
              plan={plan}
              existingDataSources={
                vaultDataSourceViews
                  .filter((dsView) => isManaged(dsView.dataSource))
                  .map(
                    (v) => v.dataSource
                  ) as DataSourceWithConnectorDetailsType[]
                // We need to filter and then cast because useVaultDataSourceViewsWithDetails can return dataSources with connectorProvider as null
              }
              setIsProviderLoading={(provider, isLoading) => {
                setIsNewConnectorLoading(isLoading);
                setIsLoadingByProvider((prev) => ({
                  ...prev,
                  [provider]: isLoading,
                }));
              }}
              onCreated={async (dataSource) => {
                const updateDataSourceViews =
                  await mutateVaultDataSourceViews();
                if (updateDataSourceViews) {
                  const view = updateDataSourceViews.dataSourceViews.find(
                    (v: DataSourceViewType) =>
                      v.dataSource.sId === dataSource.sId
                  );
                  if (view) {
                    setSelectedDataSourceView(view);
                    if (
                      dataSource.connectorProvider &&
                      REDIRECT_TO_EDIT_PERMISSIONS.includes(
                        dataSource.connectorProvider
                      )
                    ) {
                      setShowConnectorPermissionsModal(true);
                    }
                  }
                }
                setIsNewConnectorLoading(false);
              }}
              integrations={integrations}
            />
          </div>
        )}
        {!isSystemVault && isManagedCategory && (
          <EditVaultManagedDataSourcesViews
            owner={owner}
            vault={vault}
            systemVault={systemVault}
            isAdmin={isAdmin}
          />
        )}
        {isFolder && selectedDataSourceView && (
          <ViewFolderAPIModal
            isOpen={showViewFolderAPIModal}
            owner={owner}
            vault={vault}
            dataSource={selectedDataSourceView?.dataSource}
            onClose={() => setShowViewFolderAPIModal(false)}
          />
        )}
        {isWebsiteOrFolder && (
          <>
            <EditVaultStaticDatasourcesViews
              isOpen={showFolderOrWebsiteModal}
              onOpen={() => {
                setSelectedDataSourceView(null);
                setShowFolderOrWebsiteModal(true);
              }}
              owner={owner}
              vault={vault}
              canWriteInVault={canWriteInVault}
              dataSources={dataSources}
              dataSourceView={selectedDataSourceView}
              plan={plan}
              category={category}
              onClose={() => {
                setShowFolderOrWebsiteModal(false);
              }}
            />
            {selectedDataSourceView && (
              <DeleteStaticDataSourceDialog
                owner={owner}
                dataSource={selectedDataSourceView.dataSource}
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
          columns={getTableColumns({
            isManaged: isManagedCategory,
            isWebsite: isWebsite,
            vault,
          })}
          filter={dataSourceSearch}
          filterColumn="name"
          sorting={sorting}
          setSorting={setSorting}
          pagination={pagination}
          setPagination={setPagination}
          columnsBreakpoints={{
            lastSync: "md",
            managedBy: "sm",
          }}
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
              readOnly={false}
              isAdmin={isAdmin}
            />
          </>
        )}
    </>
  );
};
