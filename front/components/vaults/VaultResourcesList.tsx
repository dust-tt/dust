import {
  Button,
  Chip,
  DataTable,
  DropdownMenu,
  PlusIcon,
  Popup,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
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
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import VaultCreateFolderModal from "@app/components/vaults/VaultCreateFolderModal";
import VaultCreateWebsiteModal from "@app/components/vaults/VaultCreateWebsiteModal";
import { useSubmitFunction } from "@app/lib/client/utils";
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
  category,
  onSelect,
}: VaultResourcesListProps) => {
  const router = useRouter();
  const [showDatasourceLimitPopup, setShowDatasourceLimitPopup] =
    useState(false);
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [showAddWebsiteModal, setShowAddWebsiteModal] = useState(false);

  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { dataSources, isDataSourcesLoading } = useDataSources(owner);

  const managedDataSources = dataSources.filter(
    (ds) => ds.connectorProvider && ds.connectorProvider !== "webcrawler"
  );
  const searchBarRef = useRef<HTMLInputElement>(null);

  const { vaultDataSourceViews, isVaultDataSourceViewsLoading } =
    useVaultDataSourceViews({
      workspaceId: owner.sId,
      vaultId: vault.sId,
      category: category,
    });

  const { submit: handleCreateStaticDataSource } = useSubmitFunction(
    async (type: "files" | "webfolder") => {
      if (
        plan.limits.dataSources.count != -1 &&
        dataSources.length >= plan.limits.dataSources.count
      ) {
        setShowDatasourceLimitPopup(true);
      } else if (type === "files") {
        setShowAddFolderModal(true);
      } else if (type === "webfolder") {
        setShowAddWebsiteModal(true);
      }
    }
  );

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

  const setUpDataSources = vaultDataSourceViews.map((dsv) => dsv.connectorId);
  const unusedDataSources = managedDataSources.filter(
    (ds) => !setUpDataSources.includes(ds.connectorId)
  );

  return (
    <>
      <Popup
        show={showDatasourceLimitPopup}
        chipLabel={`${plan.name} plan`}
        description={`You have reached the limit of data sources (${plan.limits.dataSources.count} data sources). Upgrade your plan for unlimited datasources.`}
        buttonLabel="Check Dust plans"
        buttonClick={() => {
          void router.push(`/w/${owner.sId}/subscription`);
        }}
        onClose={() => {
          setShowDatasourceLimitPopup(false);
        }}
        className="absolute bottom-8 right-0"
      />
      <VaultCreateFolderModal
        isOpen={showAddFolderModal}
        setOpen={(isOpen) => {
          setShowAddFolderModal(isOpen);
        }}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
      />
      <VaultCreateWebsiteModal
        isOpen={showAddWebsiteModal}
        setOpen={(isOpen) => {
          setShowAddWebsiteModal(isOpen);
        }}
        owner={owner}
        dataSources={dataSources}
        dataSource={null}
        webCrawlerConfiguration={null}
      />
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
          <Button
            label="Add folder"
            onClick={async () => {
              await handleCreateStaticDataSource("files");
            }}
            icon={PlusIcon}
          />
        )}
        {category === "webfolder" && (
          <Button
            label="Add site"
            onClick={async () => {
              await handleCreateStaticDataSource("webfolder");
            }}
            icon={PlusIcon}
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
