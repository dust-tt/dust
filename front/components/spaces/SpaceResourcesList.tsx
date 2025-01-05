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
  DataSourceWithAgentsUsageType,
  DataSourceWithConnectorDetailsType,
  PlanType,
  SpaceType,
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
import { useCallback, useMemo } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { ConnectorPermissionsModal } from "@app/components/ConnectorPermissionsModal";
import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import type { DataSourceIntegration } from "@app/components/spaces/AddConnectionMenu";
import { AddConnectionMenu } from "@app/components/spaces/AddConnectionMenu";
import { EditSpaceManagedDataSourcesViews } from "@app/components/spaces/EditSpaceManagedDatasourcesViews";
import { EditSpaceStaticDatasourcesViews } from "@app/components/spaces/EditSpaceStaticDatasourcesViews";
import { UsedByButton } from "@app/components/spaces/UsedByButton";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getDataSourceNameFromView, isManaged } from "@app/lib/data_sources";
import { useAgentConfigurationSIdLookup } from "@app/lib/swr/assistants";
import {
  useDeleteFolderOrWebsite,
  useSpaceDataSourceViewsWithDetails,
} from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";

import { ViewFolderAPIModal } from "../ViewFolderAPIModal";

const REDIRECT_TO_EDIT_PERMISSIONS = [
  "confluence",
  "google_drive",
  "microsoft",
  "slack",
  "intercom",
  "snowflake",
  "zendesk",
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

const getTableColumns = ({
  setAssistantName,
  isManaged,
  isWebsite,
  space,
}: {
  setAssistantName: (name: string | null) => void;
  isManaged: boolean;
  isWebsite: boolean;
  space: SpaceType;
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

  const isGlobalOrSystemSpace = ["global", "system"].includes(space.kind);

  const managedByColumn = {
    header: "Managed by",
    accessorFn: (row: RowData) =>
      isGlobalOrSystemSpace
        ? row.dataSourceView.dataSource.editedByUser?.imageUrl
        : row.dataSourceView.editedByUser?.imageUrl,
    meta: {
      width: "6rem",
    },
    id: "managedBy",
    accessorKey: "managedBy",
    cell: (info: CellContext<RowData, string>) => {
      const dsv = info.row.original.dataSourceView;
      const editedByUser = isGlobalOrSystemSpace
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
          <DataTable.CellContent>
            <UsedByButton
              usage={info.row.original.dataSourceView.usage}
              onItemClick={setAssistantName}
            />
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
              label={original.isLoading ? "Connecting..." : "Connect"}
            />
          </DataTable.CellContent>
        );
      } else {
        return (
          <DataTable.CellContent>
            <Button
              variant="outline"
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

  if (space.kind === "system" && isManaged) {
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
  const [assistantName, setAssistantName] = useState<string | null>(null); // To show the assistant details
  const { sId: assistantSId } = useAgentConfigurationSIdLookup({
    workspaceId: owner.sId,
    agentConfigurationName: assistantName,
  });

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
  const router = useRouter();

  const searchBarRef = useRef<HTMLInputElement>(null);

  const isSystemSpace = systemSpace.sId === space.sId;
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
    spaceId: space.sId,
    category,
  });

  // DataSources Views of the current space.
  const {
    spaceDataSourceViews,
    isSpaceDataSourceViewsLoading,
    mutateRegardlessOfQueryParams: mutateSpaceDataSourceViews,
  } = useSpaceDataSourceViewsWithDetails({
    workspaceId: owner.sId,
    spaceId: space.sId,
    category: category,
  });

  const rows: RowData[] = useMemo(
    () =>
      spaceDataSourceViews?.map((dataSourceView) => {
        const moreMenuItems = [];
        if (isWebsiteOrFolder && canWriteInSpace) {
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
      spaceDataSourceViews,
      isAdmin,
      isFolder,
      isWebsiteOrFolder,
      canWriteInSpace,
    ]
  );

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
            ? "h-36 w-full items-center justify-center rounded-xl bg-muted-background"
            : ""
        )}
      >
        {rows.length > 0 && (
          <SearchInput
            name="search"
            ref={searchBarRef}
            placeholder="Search (Name)"
            value={dataSourceSearch}
            onChange={(s) => {
              setDataSourceSearch(s);
            }}
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
            dataSource={selectedDataSourceView?.dataSource}
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
        <AssistantDetails
          owner={owner}
          assistantId={assistantSId}
          onClose={() => setAssistantName(null)}
        />
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns({
            setAssistantName,
            isManaged: isManagedCategory,
            isWebsite: isWebsite,
            space,
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
      <ConnectorPermissionsModal
        owner={owner}
        connector={selectedDataSourceView?.dataSource.connector ?? null}
        dataSource={selectedDataSourceView?.dataSource ?? null}
        isOpen={showConnectorPermissionsModal && !!selectedDataSourceView}
        onClose={() => {
          setShowConnectorPermissionsModal(false);
        }}
        readOnly={false}
        isAdmin={isAdmin}
      />
    </>
  );
};
