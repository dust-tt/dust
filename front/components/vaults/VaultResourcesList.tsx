import { Chip, DataTable, Searchbar, Spinner } from "@dust-tt/sparkle";
import type {
  ConnectorType,
  DataSourceViewCategory,
  EditedByUser,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { FolderIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { EditVaultManagedDataSourcesViews } from "@app/components/vaults/EditVaultManagedDatasourcesViews";
import { EditVaultStaticDataSourcesViews } from "@app/components/vaults/EditVaultStaticDatasourcesViews";
import {
  CONNECTOR_CONFIGURATIONS,
  getDataSourceNameFromView,
} from "@app/lib/connector_providers";
import { useDataSources, useVaultDataSourceViews } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type RowData = {
  category: string;
  label: string;
  icon: ComponentType;
  usage: number;
  count: number;
  connector?: ConnectorType;
  fetchConnectorError?: string;
  dataSourceName: string;
  workspaceId: string;
  editedByUser?: EditedByUser | null;
  onClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

type VaultResourcesListProps = {
  owner: WorkspaceType;
  plan: PlanType;
  isAdmin: boolean;
  vault: VaultType;
  systemVault: VaultType;
  category: DataSourceViewCategory;
  onSelect: (sId: string) => void;
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "label",
      id: "label",
      cell: (info: Info) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          <span className="font-bold"> {info.row.original.label}</span> (
          {info.row.original.count} items)
        </DataTable.CellContent>
      ),
    },
    {
      header: "Managed by",
      cell: (info: Info) => (
        <DataTable.CellContent
          avatarUrl={info.row.original.editedByUser?.imageUrl ?? ""}
          roundedAvatar={true}
        />
      ),
    },
    {
      header: "Last sync",
      accessorKey: "editedByUser.editedAt",
      cell: (info: Info) => (
        <DataTable.CellContent className="pr-2">
          {(() => {
            if (!info.row.original.connector) {
              return <Chip color="amber">Never</Chip>;
            } else if (info.row.original.fetchConnectorError) {
              return (
                <Chip color="warning">
                  Error loading the connector. Try again in a few minutes.
                </Chip>
              );
            } else {
              return (
                info.row.original.workspaceId &&
                info.row.original.dataSourceName && (
                  <ConnectorSyncingChip
                    initialState={info.row.original.connector}
                    workspaceId={info.row.original.workspaceId}
                    dataSourceName={info.row.original.dataSourceName}
                  />
                )
              );
            }
          })()}
        </DataTable.CellContent>
      ),
    },
  ];
};

export const VaultResourcesList = ({
  owner,
  plan,
  isAdmin,
  vault,
  systemVault,
  category,
  onSelect,
}: VaultResourcesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { dataSources, isDataSourcesLoading } = useDataSources(owner);

  const searchBarRef = useRef<HTMLInputElement>(null);

  // DataSources Views of the current vault.
  const { vaultDataSourceViews, isVaultDataSourceViewsLoading } =
    useVaultDataSourceViews({
      workspaceId: owner.sId,
      vaultId: vault.sId,
      category: category,
    });

  const rows: RowData[] =
    vaultDataSourceViews?.map((r) => ({
      sId: r.sId,
      category: r.category,
      label: getDataSourceNameFromView(r),
      icon: r.connectorProvider
        ? CONNECTOR_CONFIGURATIONS[r.connectorProvider].logoComponent
        : FolderIcon,
      usage: r.usage,
      count: 0,
      editedByUser: r.editedByUser,
      workspaceId: owner.sId,
      dataSourceName: r.name,
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
        {category === "managed" && (
          <EditVaultManagedDataSourcesViews
            owner={owner}
            vault={vault}
            systemVault={systemVault}
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
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn="label"
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
