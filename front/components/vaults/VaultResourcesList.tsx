import {
  Button,
  Chip,
  DataTable,
  DropdownMenu,
  PlusIcon,
  RobotIcon,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  ConnectorType,
  DataSourceOrViewCategory,
  EditedByUser,
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
import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import {
  CONNECTOR_CONFIGURATIONS,
  getDataSourceOrViewName,
} from "@app/lib/connector_providers";
import { useDataSources, useVaultDataSourceOrViews } from "@app/lib/swr";
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
  isAdmin: boolean;
  vault: VaultType;
  category: DataSourceOrViewCategory;
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
      header: "Used by",
      accessorKey: "usage",
      cell: (info: Info) => (
        <>
          {info.row.original.usage ? (
            <DataTable.CellContent icon={RobotIcon}>
              {info.row.original.usage}
            </DataTable.CellContent>
          ) : null}
        </>
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
  isAdmin,
  vault,
  category,
  onSelect,
}: VaultResourcesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { dataSources, isDataSourcesLoading } = useDataSources(owner);

  const managedDataSources = dataSources.filter(
    (ds) => ds.connectorProvider && ds.connectorProvider !== "webcrawler"
  );
  const searchBarRef = useRef<HTMLInputElement>(null);

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
      label: getDataSourceOrViewName(r),
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

  if (isDataSourcesLoading || isVaultDataSourceOrViewsLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const setUpDataSources = vaultDataSourceOrViews.map((dsv) => dsv.connectorId);
  const unusedDataSources = managedDataSources.filter(
    (ds) => !setUpDataSources.includes(ds.connectorId)
  );

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
        {category === "managed" && unusedDataSources.length > 0 && (
          <DropdownMenu>
            <DropdownMenu.Button>
              <Button
                label="Add data from connections"
                variant="primary"
                icon={PlusIcon}
                size="sm"
              />
            </DropdownMenu.Button>
            <DropdownMenu.Items width={180}>
              {unusedDataSources.map((ds) => (
                <DropdownMenu.Item
                  key={ds.name}
                  label={ds.name}
                  icon={
                    ds.connectorProvider
                      ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider]
                          .logoComponent
                      : FolderIcon
                  }
                  // TODO: add select data sources screen
                  onClick={() => {}}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        )}
        {category === "files" && (
          <Button label="Add folder" onClick={() => {}} icon={PlusIcon} />
        )}
        {category === "webfolder" && (
          <Button label="Add site" onClick={() => {}} icon={PlusIcon} />
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
