import {
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  DataTable,
  FolderIcon,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceViewCategory,
  DataSourceViewWithConnectorType,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { AddConnectionMenu } from "@app/components/vaults/AddConnectionMenu";
import { EditVaultManagedDataSourcesViews } from "@app/components/vaults/EditVaultManagedDatasourcesViews";
import { EditVaultStaticDataSourcesViews } from "@app/components/vaults/EditVaultStaticDatasourcesViews";
import {
  getConnectorProviderLogoWithFallback,
  getDataSourceNameFromView,
} from "@app/lib/connector_providers";
import { useDataSources, useVaultDataSourceViews } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type RowData = {
  dataSourceView: DataSourceViewWithConnectorType;
  label: string;
  icon: ComponentType;
  workspaceId: string;
  isAdmin: boolean;
  isLoading?: boolean;
  buttonOnClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
};

type VaultResourcesListProps = {
  dustClientFacingUrl: string;
  owner: WorkspaceType;
  plan: PlanType;
  isAdmin: boolean;
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
  const nameColumn = {
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
                dataSourceName={
                  info.row.original.dataSourceView.dataSource.name
                }
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
  plan,
  isAdmin,
  dustClientFacingUrl,
  vault,
  systemVault,
  category,
  onSelect,
}: VaultResourcesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { dataSources, isDataSourcesLoading } = useDataSources(owner);

  const searchBarRef = useRef<HTMLInputElement>(null);

  const isSystemVault = systemVault.sId === vault.sId;
  const isManaged = category === "managed";

  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Partial<Record<ConnectorProvider, boolean>>
  >({});

  const router = useRouter();

  // DataSources Views of the current vault.
  const { vaultDataSourceViews, isVaultDataSourceViewsLoading } =
    useVaultDataSourceViews({
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
      buttonOnClick: (e) => {
        e.stopPropagation();
        // TODO(GROUPS_UI) Link to data source view.
        void router.push(
          `/w/${owner.sId}/builder/data-sources/${r.dataSource.name}`
        );
      },
      onClick: () => onSelect(r.sId),
    })) || [];

  if (isDataSourcesLoading || isVaultDataSourceViewsLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <div
        className={classNames(
          "flex gap-2",
          rows.length === 0 && isAdmin
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
              setIsProviderLoading={(provider, isLoading) =>
                setIsLoadingByProvider((prev) => ({
                  ...prev,
                  [provider]: isLoading,
                }))
              }
            />
          </div>
        )}
        {!isSystemVault && category === "managed" && (
          <EditVaultManagedDataSourcesViews
            owner={owner}
            vault={vault}
            systemVault={systemVault}
            isAdmin={isAdmin}
          />
        )}
        {(category === "folder" || category === "website") && (
          <EditVaultStaticDataSourcesViews
            owner={owner}
            plan={plan}
            vault={vault}
            category={category}
            dataSources={dataSources}
          />
        )}
      </div>
      {rows.length > 0 ? (
        <DataTable
          data={rows}
          columns={getTableColumns({ isManaged, isSystemVault })}
          filter={dataSourceSearch}
          filterColumn="name"
          initialColumnOrder={[{ desc: false, id: "name" }]}
        />
      ) : !isAdmin ? (
        <div className="flex items-center justify-center text-sm font-normal text-element-700">
          No available connection
        </div>
      ) : (
        <></>
      )}
    </>
  );
};
