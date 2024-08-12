import {
  Button,
  Chip,
  DataTable,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  ConnectorType,
  EditedByUser,
  ResourceCategory,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { FolderIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useVaultDataSourceOrViews } from "@app/lib/swr";
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
  onMoreClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

type VaultResourcesListProps = {
  owner: WorkspaceType;
  isAdmin: boolean;
  vault: VaultType;
  category: ResourceCategory;
  onSelect: (sId: string) => void;
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: Info) => (
        <DataTable.Cell
          iconClassName="text-emerald-500"
          icon={info.row.original.icon}
        >
          <span className="font-bold"> {info.row.original.label}</span> (
          {info.row.original.count} items)
        </DataTable.Cell>
      ),
    },
    {
      header: "Used by",
      accessorKey: "usage",
      cell: (info: Info) => (
        <>
          {info.row.original.usage ? (
            <DataTable.Cell icon={RobotIcon}>
              {info.row.original.usage}
            </DataTable.Cell>
          ) : null}
        </>
      ),
    },
    {
      header: "Managed by",
      cell: (info: Info) => (
        <DataTable.Cell
          avatarUrl={info.row.original.editedByUser?.imageUrl ?? ""}
        />
      ),
    },
    {
      header: "Last sync",
      accessorKey: "editedByUser.editedAt",
      cell: (info: Info) => (
        <DataTable.Cell className="w-10">
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
        </DataTable.Cell>
      ),
    },
  ];
};

export const VaultResourcesList = ({
  owner,
  isAdmin,
  vault,
  category,
  onSelect,
}: VaultResourcesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { vaultDataSourceOrViews, isVaultDataSourceOrViewsLoading } =
    useVaultDataSourceOrViews({
      workspaceId: owner.sId,
      vaultId: vault.sId,
      type: CATEGORY_DETAILS[category].dataSourceOrView,
      category: category,
    });

  const rows: RowData[] =
    vaultDataSourceOrViews?.map((r) => ({
      sId: r.sId,
      category: r.category,
      label: r.connectorProvider
        ? CONNECTOR_CONFIGURATIONS[r.connectorProvider].name
        : r.name,
      icon: r.connectorProvider
        ? CONNECTOR_CONFIGURATIONS[r.connectorProvider].logoComponent
        : FolderIcon,
      usage: r.usage,
      count: 0,
      editedByUser: r.editedByUser,
      workspaceId: owner.sId,
      dataSourceName: r.name,
      onClick: () => onSelect(r.sId),
      onMoreClick: () => {},
    })) || [];

  if (isVaultDataSourceOrViewsLoading) {
    return "loader";
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
            placeholder="Search (Name)"
            value={dataSourceSearch}
            onChange={(s) => {
              setDataSourceSearch(s);
            }}
          />
        )}
        {category === "managed" && (
          <Button label="Add Connected Data" onClick={() => {}} />
        )}
        {category === "files" && (
          <Button label="Add folder" onClick={() => {}} />
        )}
        {category === "webfolder" && (
          <Button label="Add site" onClick={() => {}} />
        )}
      </div>
      {rows.length > 0 ? (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn={"name"}
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
