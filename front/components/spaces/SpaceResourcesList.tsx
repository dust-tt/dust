import type { MenuItem } from "@dust-tt/sparkle";
import {
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  CubeIcon,
  DataTable,
  FolderIcon,
  PencilSquareIcon,
  SearchInput,
  Spinner,
  TrashIcon,
  usePaginationFromUrl,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceViewCategory,
  DataSourceViewsWithDetails,
  DataSourceViewType,
  DataSourceWithConnectorDetailsType,
  PlanType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { isWebsiteOrFolderCategory } from "@dust-tt/types";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useRouter } from "next/router";
import React, { useCallback, useMemo, useRef, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { ConnectorPermissionsModal } from "@app/components/ConnectorPermissionsModal";
import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import type { DataSourceIntegration } from "@app/components/spaces/AddConnectionMenu";
import { AddConnectionMenu } from "@app/components/spaces/AddConnectionMenu";
import { EditSpaceManagedDataSourcesViews } from "@app/components/spaces/EditSpaceManagedDatasourcesViews";
import { EditSpaceStaticDatasourcesViews } from "@app/components/spaces/EditSpaceStaticDatasourcesViews";
import { UsedByButton } from "@app/components/spaces/UsedByButton";
import { ViewFolderAPIModal } from "@app/components/ViewFolderAPIModal";
import {
  getConnectorProviderLogoWithFallback,
  isConnectorPermissionsEditable,
} from "@app/lib/connector_providers";
import { getDataSourceNameFromView, isManaged } from "@app/lib/data_sources";
import { useAgentConfigurationSIdLookup } from "@app/lib/swr/assistants";
import {
  useDeleteFolderOrWebsite,
  useSpaceDataSourceViewsWithDetails,
} from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";

export interface RowData {
  dataSourceView: DataSourceViewsWithDetails;
  label: string;
  icon: React.ComponentType;
  workspaceId: string;
  isAdmin: boolean;
  isLoading?: boolean;
  buttonOnClick?: (e: MouseEvent) => void;
  onClick?: () => void;
  menuItems?: MenuItem[]; // changed from moreMenuItems
}

type StringColumnDef = ColumnDef<RowData, string>;
type NumberColumnDef = ColumnDef<RowData, number>;

type TableColumnDef = StringColumnDef | NumberColumnDef;

function getTableColumns(
  setAssistantName: (a: string | null) => void,
  isManaged: boolean,
  isWebsite: boolean,
  space: SpaceType
): TableColumnDef[] {
  const isGlobalOrSystemSpace = ["global", "system"].includes(space.kind);
  const nameColumn: ColumnDef<RowData, string> = {
    id: "name",
    meta: {
      className: "w-96",
    },
    // We can define an accessorFn to read row.label:
    accessorFn: (row) => row.label,
    sortingFn: "text",
    cell: (info) => (
      <DataTable.CellContent icon={info.row.original.icon}>
        <span>{info.getValue()}</span>
      </DataTable.CellContent>
    ),
  };
  const managedByColumn: ColumnDef<RowData, string | undefined> = {
    id: "managedBy",
    header: "Managed by",
    accessorFn: (row) =>
      isGlobalOrSystemSpace
        ? row.dataSourceView.dataSource.editedByUser?.imageUrl ?? undefined
        : row.dataSourceView.editedByUser?.imageUrl ?? undefined,
    cell: (ctx) => {
      const { dataSourceView } = ctx.row.original;
      const editedByUser = isGlobalOrSystemSpace
        ? dataSourceView.dataSource.editedByUser
        : dataSourceView.editedByUser;
      return (
        <DataTable.CellContent
          avatarUrl={ctx.getValue()}
          avatarTooltipLabel={editedByUser?.fullName ?? undefined}
          roundedAvatar
        />
      );
    },
  };
  const usedByColumn: ColumnDef<RowData, number> = {
    id: "usedBy",
    header: "Used by",
    // Return a numeric count to allow numeric sorts if we want
    accessorFn: (row) => row.dataSourceView.usage?.count ?? 0,
    cell: (ctx) => {
      const usage = ctx.row.original.dataSourceView.usage;
      return (
        <DataTable.CellContent>
          <UsedByButton usage={usage} onItemClick={setAssistantName} />
        </DataTable.CellContent>
      );
    },
  };
  // For lastSynced, we store a number or undefined in accessorFn
  const lastSyncedColumn: ColumnDef<RowData, number | undefined> = {
    id: "lastSync",
    header: "Last sync",
    meta: {
      className: "w-48",
    },
    accessorFn: (row) =>
      row.dataSourceView.dataSource.connector?.lastSyncSuccessfulTime,
    cell: (info) => {
      const ds = info.row.original.dataSourceView.dataSource;
      return (
        <DataTable.CellContent className="pr-2">
          {!ds.connector && !ds.fetchConnectorError && (
            <Chip color="amber">Never</Chip>
          )}
          {ds.fetchConnectorError && (
            <Chip color="warning">Retry in a few minutes</Chip>
          )}
          {ds.connector && info.row.original.workspaceId && ds.name && (
            <ConnectorSyncingChip
              initialState={ds.connector}
              workspaceId={info.row.original.workspaceId}
              dataSource={ds}
            />
          )}
        </DataTable.CellContent>
      );
    },
  };
  // The "Connect" or "Manage" button
  const actionColumn: ColumnDef<RowData, unknown> = {
    id: "action",
    cell: (ctx) => {
      const { dataSourceView, isLoading, isAdmin, buttonOnClick } =
        ctx.row.original;
      const disabled = isLoading || !isAdmin;
      const connector = dataSourceView.dataSource.connector;
      if (!connector) {
        return (
          <DataTable.CellContent>
            <Button
              variant="primary"
              size="xs"
              icon={CloudArrowLeftRightIcon}
              disabled={disabled}
              onClick={buttonOnClick}
              label={isLoading ? "Connecting..." : "Connect"}
            />
          </DataTable.CellContent>
        );
      }
      return (
        <DataTable.CellContent>
          <Button
            variant="outline"
            icon={Cog6ToothIcon}
            disabled={disabled}
            onClick={buttonOnClick}
            label={isAdmin ? "Manage" : "View"}
            size="xs"
          />
        </DataTable.CellContent>
      );
    },
  };

  const moreActions: ColumnDef<RowData, unknown> = {
    id: "actions",
    header: "",
    meta: {
      className: "flex justify-end items-center",
    },
    cell: (ctx) => (
      <DataTable.MoreButton menuItems={ctx.row.original.menuItems} />
    ),
  };

  // Decide which columns to return
  if (space.kind === "system" && isManaged) {
    return [
      nameColumn,
      usedByColumn,
      managedByColumn,
      lastSyncedColumn,
      actionColumn,
    ];
  }
  if (isManaged || isWebsite) {
    return [
      nameColumn,
      usedByColumn,
      managedByColumn,
      lastSyncedColumn,
      moreActions,
    ];
  }
  return [nameColumn, usedByColumn, managedByColumn, moreActions];
}

interface SpaceResourcesListProps {
  owner: WorkspaceType;
  plan: PlanType;
  isAdmin: boolean;
  canWriteInSpace: boolean;
  space: SpaceType;
  systemSpace: SpaceType;
  category: Exclude<DataSourceViewCategory, "apps">;
  onSelect: (sId: string) => void;
  integrations: DataSourceIntegration[];
}

export const SpaceResourcesList = ({
  owner,
  plan,
  isAdmin,
  canWriteInSpace,
  space,
  systemSpace,
  category,
  onSelect,
  integrations,
}: SpaceResourcesListProps) => {
  const [assistantName, setAssistantName] = useState<string | null>(null);
  const { sId: assistantSId } = useAgentConfigurationSIdLookup({
    workspaceId: owner.sId,
    agentConfigurationName: assistantName,
  });
  const [dataSourceSearch, setDataSourceSearch] = useState("");
  const [showConnectorPermissionsModal, setShowConnectorPermissionsModal] =
    useState(false);
  const [selectedDataSourceView, setSelectedDataSourceView] =
    useState<DataSourceViewsWithDetails | null>(null);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [showFolderOrWebsiteModal, setShowFolderOrWebsiteModal] =
    useState(false);
  const [showViewFolderAPIModal, setShowViewFolderAPIModal] = useState(false);
  const [isNewConnectorLoading, setIsNewConnectorLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Partial<Record<ConnectorProvider, boolean>>
  >({});

  const searchBarRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isSystemSpace = systemSpace.sId === space.sId;
  const isManagedCategory = category === "managed";
  const isWebsite = category === "website";
  const isFolder = category === "folder";
  const isWebsiteOrFolder = isWebsiteOrFolderCategory(category);

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });
  const doDelete = useDeleteFolderOrWebsite({
    owner,
    spaceId: space.sId,
    category,
  });
  const {
    spaceDataSourceViews,
    isSpaceDataSourceViewsLoading,
    mutateRegardlessOfQueryParams: mutateSpaceDataSourceViews,
  } = useSpaceDataSourceViewsWithDetails({
    workspaceId: owner.sId,
    spaceId: space.sId,
    category,
  });

  const rows: RowData[] = useMemo(() => {
    if (!spaceDataSourceViews) {
      return [];
    }
    return spaceDataSourceViews.map((dataSourceView) => {
      const provider = dataSourceView.dataSource.connectorProvider;

      const menuItems: MenuItem[] = [];
      if (isWebsiteOrFolder && canWriteInSpace) {
        menuItems.push({
          label: "Edit",
          kind: "item",
          icon: PencilSquareIcon,
          onClick: (e) => {
            e.stopPropagation();
            setSelectedDataSourceView(dataSourceView);
            setShowFolderOrWebsiteModal(true);
          },
        });
        if (isFolder) {
          menuItems.push({
            label: "Use from API",
            kind: "item",
            icon: CubeIcon,
            onClick: (e) => {
              e.stopPropagation();
              setSelectedDataSourceView(dataSourceView);
              setShowViewFolderAPIModal(true);
            },
          });
        }
        menuItems.push({
          label: "Delete",
          icon: TrashIcon,
          kind: "item",
          variant: "warning",
          onClick: (e) => {
            e.stopPropagation();
            setSelectedDataSourceView(dataSourceView);
            setShowDeleteConfirmDialog(true);
          },
        });
      }

      return {
        dataSourceView,
        label: getDataSourceNameFromView(dataSourceView),
        icon: getConnectorProviderLogoWithFallback(provider, FolderIcon),
        workspaceId: owner.sId,
        isAdmin,
        isLoading: provider ? isLoadingByProvider[provider] : false,
        menuItems,
        buttonOnClick: (e) => {
          e.stopPropagation();
          setSelectedDataSourceView(dataSourceView);
          setShowConnectorPermissionsModal(true);
        },
        onClick: () => onSelect(dataSourceView.sId),
      };
    });
  }, [
    spaceDataSourceViews,
    owner.sId,
    isAdmin,
    isLoadingByProvider,
    isWebsiteOrFolder,
    canWriteInSpace,
    isFolder,
    onSelect,
  ]);

  const onSelectedDataUpdated = useCallback(async () => {
    await mutateSpaceDataSourceViews();
  }, [mutateSpaceDataSourceViews]);

  const onDeleteFolderOrWebsite = useCallback(async () => {
    if (selectedDataSourceView?.dataSource) {
      const res = await doDelete(selectedDataSourceView);
      if (res) {
        await router.push(
          `/w/${owner.sId}/spaces/${space.sId}/categories/${selectedDataSourceView.category}`
        );
      }
    }
  }, [selectedDataSourceView, doDelete, router, owner.sId, space.sId]);

  if (isSpaceDataSourceViewsLoading || isNewConnectorLoading) {
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
          rows.length === 0
            ? classNames(
                "h-36 w-full items-center justify-center rounded-xl",
                "bg-muted-background dark:bg-muted-background-night"
              )
            : ""
        )}
      >
        {rows.length > 0 && (
          <SearchInput
            name="search"
            ref={searchBarRef}
            placeholder="Search (Name)"
            value={dataSourceSearch}
            onChange={(s) => setDataSourceSearch(s)}
          />
        )}
        {isSystemSpace && category === "managed" && (
          <div className="flex items-center justify-center text-sm font-normal text-muted-foreground">
            <AddConnectionMenu
              owner={owner}
              plan={plan}
              existingDataSources={
                spaceDataSourceViews
                  .filter((dsView) => isManaged(dsView.dataSource))
                  .map(
                    (v) => v.dataSource
                  ) as DataSourceWithConnectorDetailsType[]
                // We need to filter and then cast because useSpaceDataSourceViewsWithDetails can
                // return dataSources with connectorProvider as null
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
                  await mutateSpaceDataSourceViews();

                if (updateDataSourceViews) {
                  const view = updateDataSourceViews.dataSourceViews.find(
                    (v: DataSourceViewType) =>
                      v.dataSource.sId === dataSource.sId
                  );
                  if (view) {
                    setSelectedDataSourceView(view);
                    if (
                      isConnectorPermissionsEditable(
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
        {!isSystemSpace && isManagedCategory && (
          <EditSpaceManagedDataSourcesViews
            isAdmin={isAdmin}
            onSelectedDataUpdated={onSelectedDataUpdated}
            owner={owner}
            systemSpace={systemSpace}
            space={space}
          />
        )}
        {isFolder && selectedDataSourceView && (
          <ViewFolderAPIModal
            isOpen={showViewFolderAPIModal}
            owner={owner}
            space={space}
            dataSource={selectedDataSourceView.dataSource}
            onClose={() => setShowViewFolderAPIModal(false)}
          />
        )}
        {isWebsiteOrFolder && (
          <>
            <EditSpaceStaticDatasourcesViews
              isOpen={showFolderOrWebsiteModal}
              onOpen={() => {
                setSelectedDataSourceView(null);
                setShowFolderOrWebsiteModal(true);
              }}
              owner={owner}
              space={space}
              canWriteInSpace={canWriteInSpace}
              dataSourceView={selectedDataSourceView}
              category={category}
              onClose={() => setShowFolderOrWebsiteModal(false)}
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
        <AssistantDetails
          owner={owner}
          assistantId={assistantSId}
          onClose={() => setAssistantName(null)}
        />
      </div>
      {rows.length > 0 && (
        <DataTable<RowData>
          data={rows}
          columns={getTableColumns(
            setAssistantName,
            isManagedCategory,
            isWebsite,
            space
          )}
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

      {selectedDataSourceView?.dataSource?.connector && (
        <ConnectorPermissionsModal
          owner={owner}
          connector={selectedDataSourceView.dataSource.connector}
          dataSource={selectedDataSourceView.dataSource}
          isOpen={showConnectorPermissionsModal && !!selectedDataSourceView}
          onClose={() => setShowConnectorPermissionsModal(false)}
          readOnly={false}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
};
