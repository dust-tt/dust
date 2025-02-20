import type { MenuItem } from "@dust-tt/sparkle";
import {
  Button,
  cn,
  Cog6ToothIcon,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SearchInput,
  Spinner,
  useHashParam,
  usePaginationFromUrl,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  APIError,
  ConnectorType,
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightWorkspaceType,
  PlanType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  isValidContentNodesViewType,
  MIN_SEARCH_QUERY_SIZE,
} from "@dust-tt/types";
import type {
  CellContext,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/router";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { ConnectorPermissionsModal } from "@app/components/ConnectorPermissionsModal";
import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import type {
  ContentActionKey,
  ContentActionsRef,
} from "@app/components/spaces/ContentActions";
import {
  ContentActions,
  getMenuItems,
} from "@app/components/spaces/ContentActions";
import { EditSpaceManagedDataSourcesViews } from "@app/components/spaces/EditSpaceManagedDatasourcesViews";
import { FoldersHeaderMenu } from "@app/components/spaces/FoldersHeaderMenu";
import { WebsitesHeaderMenu } from "@app/components/spaces/WebsitesHeaderMenu";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import { isFolder, isManaged, isWebsite } from "@app/lib/data_sources";
import {
  useDataSourceViewContentNodes,
  useDataSourceViews,
} from "@app/lib/swr/data_source_views";
import { useSpaces, useSpaceSearch } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";

const DEFAULT_VIEW_TYPE = "all";
const ROWS_COUNT_CAPPED = 1000;

type RowData = DataSourceViewContentNode & {
  icon: React.ComponentType;
  onClick?: () => void;
  menuItems?: MenuItem[];
};

const columnsBreakpoints = {
  lastUpdatedAt: "sm" as const,
  spaces: "md" as const,
};

const getTableColumns = (showSpaceUsage: boolean): ColumnDef<RowData>[] => {
  const columns: ColumnDef<RowData, any>[] = [];
  columns.push({
    header: "Name",
    accessorKey: "title",
    id: "title",
    sortingFn: "text", // built-in sorting function case-insensitive
    cell: (info: CellContext<RowData, string>) => (
      <DataTable.CellContent icon={info.row.original.icon}>
        <span>{info.getValue()}</span>
      </DataTable.CellContent>
    ),
  });

  if (showSpaceUsage) {
    columns.push({
      header: "Available to",
      id: "spaces",
      accessorKey: "spaces",
      meta: {
        className: "w-48",
      },
      cell: (info: CellContext<RowData, SpaceType[]>) => (
        <DataTable.BasicCellContent
          label={
            info.getValue().length > 0
              ? info
                  .getValue()
                  .map((v) => v.name)
                  .join(", ")
              : "-"
          }
          tooltip={
            info.getValue().length > 0
              ? info
                  .getValue()
                  .map((v) => v.name)
                  .join(", ")
              : "-"
          }
        />
      ),
    });
  }

  columns.push({
    header: "Last updated",
    id: "lastUpdatedAt",
    accessorKey: "lastUpdatedAt",
    meta: {
      className: "w-48",
    },
    cell: (info: CellContext<RowData, number>) => (
      <DataTable.BasicCellContent
        label={
          info.getValue()
            ? formatTimestampToFriendlyDate(info.getValue(), "short")
            : "-"
        }
      />
    ),
  });

  columns.push({
    id: "actions",
    header: "",
    meta: {
      className: "flex justify-end items-center",
    },
    cell: (info) =>
      info.row.original.menuItems && (
        <DataTable.MoreButton menuItems={info.row.original.menuItems} />
      ),
  });

  return columns;
};

function useStaticDataSourceViewHasContent({
  owner,
  dataSourceView,
  parentId,
  viewType,
}: {
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType;
  parentId?: string;
  viewType: ContentNodesViewType;
}) {
  // We don't do the call if the dataSourceView is managed.
  const { isNodesLoading, nodes, isNodesValidating } =
    useDataSourceViewContentNodes({
      dataSourceView: isManaged(dataSourceView.dataSource)
        ? undefined
        : dataSourceView,
      owner,
      internalIds: parentId ? [parentId] : undefined,
      pagination: {
        pageIndex: 0,
        pageSize: 1,
      },
      viewType,
    });

  return {
    hasContent: isManaged(dataSourceView.dataSource) ? true : !!nodes?.length,
    isLoading: isManaged(dataSourceView.dataSource) ? false : isNodesLoading,
    isNodesValidating,
  };
}

type SpaceDataSourceViewContentListProps = {
  canReadInSpace: boolean;
  canWriteInSpace: boolean;
  connector: ConnectorType | null;
  dataSourceView: DataSourceViewType;
  isAdmin: boolean;
  onSelect: (parentId: string) => void;
  owner: WorkspaceType;
  parentId?: string;
  plan: PlanType;
  space: SpaceType;
  systemSpace: SpaceType;
};

export const SpaceDataSourceViewContentList = ({
  canReadInSpace,
  canWriteInSpace,
  connector,
  dataSourceView,
  isAdmin,
  onSelect,
  owner,
  parentId,
  plan,
  space,
  systemSpace,
}: SpaceDataSourceViewContentListProps) => {
  // TODO(20250220, search-kb): remove this once the feature flag is enabled by default
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const searchFeatureFlag = featureFlags.includes("search_knowledge_builder");

  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [showConnectorPermissionsModal, setShowConnectorPermissionsModal] =
    useState(false);
  const sendNotification = useSendNotification();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const contentActionsRef = useRef<ContentActionsRef>(null);

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
    initialPageSize: 25,
  });
  const [viewType, setViewType] = useHashParam(
    "viewType",
    DEFAULT_VIEW_TYPE
  ) as [ContentNodesViewType, (viewType: ContentNodesViewType) => void];
  const router = useRouter();
  const showSpaceUsage =
    dataSourceView.kind === "default" && isManaged(dataSourceView.dataSource);
  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    disabled: !showSpaceUsage,
  });
  const { dataSourceViews, mutateDataSourceViews } = useDataSourceViews(owner, {
    disabled: !showSpaceUsage,
  });
  const handleViewTypeChange = useCallback(
    (newViewType: ContentNodesViewType) => {
      if (newViewType !== viewType) {
        setPagination(
          { pageIndex: 0, pageSize: pagination.pageSize },
          "replace"
        );
        setViewType(newViewType);
      }
    },
    [setPagination, setViewType, viewType, pagination.pageSize]
  );

  const { searchResultNodes, isSearchLoading, isSearchValidating } =
    useSpaceSearch({
      dataSourceViews: [dataSourceView],
      owner,
      viewType,
      search: debouncedSearch,
    });

  // TODO(20250127, nodes-core): turn to true and remove when implementing pagination
  const isServerPagination = false;
  // isFolder(dataSourceView.dataSource) && !dataSourceSearch;

  const columns = useMemo(
    () => getTableColumns(showSpaceUsage),
    [showSpaceUsage]
  );

  const {
    isNodesLoading,
    mutateRegardlessOfQueryParams: mutateContentNodes,
    nodes: childrenNodes,
    totalNodesCount,
  } = useDataSourceViewContentNodes({
    dataSourceView,
    owner,
    parentId,
    pagination: isServerPagination ? pagination : undefined,
    viewType: isValidContentNodesViewType(viewType)
      ? viewType
      : DEFAULT_VIEW_TYPE,
  });

  const isTyping = useMemo(() => {
    return (
      dataSourceSearch.length >= MIN_SEARCH_QUERY_SIZE &&
      debouncedSearch !== dataSourceSearch &&
      searchFeatureFlag
    );
  }, [dataSourceSearch, debouncedSearch, searchFeatureFlag]);

  const nodes = useMemo(() => {
    if (dataSourceSearch.length >= MIN_SEARCH_QUERY_SIZE && searchFeatureFlag) {
      return searchResultNodes;
    }
    return childrenNodes;
  }, [
    dataSourceSearch.length,
    childrenNodes,
    searchResultNodes,
    searchFeatureFlag,
  ]);

  const { hasContent: hasDocuments, isNodesValidating: isDocumentsValidating } =
    useStaticDataSourceViewHasContent({
      owner,
      dataSourceView,
      parentId,
      viewType: "documents",
    });
  const { hasContent: hasTables, isNodesValidating: isTablesValidating } =
    useStaticDataSourceViewHasContent({
      owner,
      dataSourceView,
      parentId,
      viewType: "tables",
    });

  const isDataSourceManaged = isManaged(dataSourceView.dataSource);

  const addToSpace = useCallback(
    async (contentNode: DataSourceViewContentNode, spaceSId: string) => {
      const existingViewForSpace = dataSourceViews.find(
        (d) =>
          d.spaceId === spaceSId &&
          d.dataSource.sId === dataSourceView.dataSource.sId
      );

      try {
        let res;
        if (existingViewForSpace) {
          res = await fetch(
            `/api/w/${owner.sId}/spaces/${spaceSId}/data_source_views/${existingViewForSpace.sId}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                parentsToAdd: [contentNode.internalId],
              }),
            }
          );
        } else {
          res = await fetch(
            `/api/w/${owner.sId}/spaces/${spaceSId}/data_source_views`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                dataSourceId: dataSourceView.dataSource.sId,
                parentsIn: [contentNode.internalId],
              }),
            }
          );
        }

        if (!res.ok) {
          const rawError: { error: APIError } = await res.json();
          sendNotification({
            title: "Error while adding data to space",
            description: rawError.error.message,
            type: "error",
          });
        } else {
          sendNotification({
            title: "Data added to space",
            type: "success",
          });
          await mutateDataSourceViews();
        }
      } catch (e) {
        sendNotification({
          title: "Error while adding data to space",
          description: `An Unknown error ${e} occurred while adding data to space.`,
          type: "error",
        });
      }
    },
    [
      dataSourceView.dataSource.sId,
      dataSourceViews,
      mutateDataSourceViews,
      owner.sId,
      sendNotification,
    ]
  );

  useEffect(() => {
    if (!isTablesValidating && !isDocumentsValidating) {
      // If the view only has content in one of the two views, we switch to that view.
      // if both view have content, or neither views have content, we default to documents.
      if (hasTables && !hasDocuments) {
        handleViewTypeChange("tables");
      } else if (!hasTables && hasDocuments) {
        handleViewTypeChange("documents");
      } else if (!viewType) {
        handleViewTypeChange(DEFAULT_VIEW_TYPE);
      }
    }
  }, [
    hasDocuments,
    hasTables,
    handleViewTypeChange,
    viewType,
    isTablesValidating,
    isDocumentsValidating,
    isDataSourceManaged,
  ]);

  // Debounce the search input, and don't trigger the search if the query is < 3 characters
  useEffect(() => {
    if (searchFeatureFlag) {
      const timeout = setTimeout(() => {
        setDebouncedSearch(
          dataSourceSearch.length >= MIN_SEARCH_QUERY_SIZE
            ? dataSourceSearch
            : ""
        );
      }, 300);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [dataSourceSearch, searchFeatureFlag]);

  // Reset search when we navigate to a folder
  useEffect(() => {
    setDataSourceSearch("");
  }, [parentId]);

  const rows: RowData[] = useMemo(
    () =>
      nodes?.map((contentNode) => ({
        ...contentNode,
        icon: getVisualForContentNode(contentNode),
        spaces: spaces.filter((space) =>
          dataSourceViews
            .filter(
              (dsv) =>
                dsv.dataSource.sId === dataSourceView.dataSource.sId &&
                dsv.kind !== "default" &&
                contentNode.parentInternalIds &&
                contentNode.parentInternalIds.some(
                  (parentId) =>
                    !dsv.parentsIn || dsv.parentsIn.includes(parentId)
                )
            )
            .map((dsv) => dsv.spaceId)
            .includes(space.sId)
        ),
        ...(contentNode.expandable && {
          onClick: () => {
            if (contentNode.expandable) {
              onSelect(contentNode.internalId);
            }
          },
        }),
        dropdownMenuProps: {
          modal: false,
        },
        menuItems: getMenuItems(
          canReadInSpace,
          canWriteInSpace,
          dataSourceView,
          contentNode,
          contentActionsRef,
          spaces,
          dataSourceViews,
          addToSpace
        ),
      })) || [],
    [
      nodes,
      spaces,
      canReadInSpace,
      canWriteInSpace,
      dataSourceView,
      dataSourceViews,
      addToSpace,
      onSelect,
    ]
  );

  const onSelectedDataUpdated = useCallback(async () => {
    await mutateContentNodes();
  }, [mutateContentNodes]);

  const onSaveAction = useCallback(
    async (action?: ContentActionKey) => {
      await mutateContentNodes();
      if (
        action === "DocumentUploadOrEdit" ||
        action === "MultipleDocumentsUpload"
      ) {
        handleViewTypeChange("documents");
      } else if (action === "TableUploadOrEdit") {
        handleViewTypeChange("tables");
      }
    },
    [handleViewTypeChange, mutateContentNodes]
  );

  const emptySpaceContent =
    isManaged(dataSourceView.dataSource) && space.kind !== "system" ? (
      isAdmin ? (
        <Button
          label="Manage Data"
          icon={Cog6ToothIcon}
          onClick={() => {
            if (systemSpace) {
              void router.push(
                `/w/${owner.sId}/spaces/${systemSpace.sId}/categories/${dataSourceView.category}`
              );
            }
          }}
        />
      ) : (
        <RequestDataSourceModal
          dataSources={[dataSourceView.dataSource]}
          owner={owner}
        />
      )
    ) : (
      <></>
    );

  const emptyContent = parentId ? <div>No content</div> : emptySpaceContent;
  const isEmpty =
    rows.length === 0 &&
    !isNodesLoading &&
    dataSourceSearch.length === 0 &&
    !isSearchLoading;

  return (
    // MultipleDocumentsUpload listens to the file drop context and uploads the files.
    <FileDropProvider>
      <DropzoneContainer
        description="Drag and drop your files here."
        title="Add Files"
        disabled={!canWriteInSpace}
      >
        <div
          className={classNames(
            "flex w-full gap-2",
            isEmpty
              ? classNames(
                  "h-36 items-center justify-center rounded-xl",
                  "bg-muted-background dark:bg-muted-background-night"
                )
              : "pb-2"
          )}
        >
          {!isEmpty && (
            <>
              <SearchInput
                name="search"
                placeholder="Search (Name)"
                value={dataSourceSearch}
                onChange={(s) => {
                  setPagination(
                    { pageIndex: 0, pageSize: pagination.pageSize },
                    "replace"
                  );
                  setDataSourceSearch(s);
                }}
              />
            </>
          )}
          {isEmpty && emptyContent}
          {isFolder(dataSourceView.dataSource) && (
            <>
              {((viewType === "tables" && hasDocuments) ||
                (viewType === "documents" && hasTables)) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      label={viewType === "documents" ? "Documents" : "Tables"}
                      variant="outline"
                      isSelect
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      label="Documents"
                      onClick={() => handleViewTypeChange("documents")}
                    />
                    <DropdownMenuItem
                      label="Tables"
                      onClick={() => handleViewTypeChange("tables")}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <FoldersHeaderMenu
                owner={owner}
                space={space}
                canWriteInSpace={canWriteInSpace}
                folder={dataSourceView}
                contentActionsRef={contentActionsRef}
              />
            </>
          )}
          {isWebsite(dataSourceView.dataSource) && (
            <WebsitesHeaderMenu
              owner={owner}
              space={space}
              canWriteInSpace={canWriteInSpace}
              dataSourceView={dataSourceView}
            />
          )}
          {isManaged(dataSourceView.dataSource) &&
            space.kind !== "system" &&
            !isEmpty && (
              <EditSpaceManagedDataSourcesViews
                owner={owner}
                space={space}
                systemSpace={systemSpace}
                isAdmin={isAdmin}
                dataSourceView={dataSourceView}
                onSelectedDataUpdated={onSelectedDataUpdated}
              />
            )}
          {isManaged(dataSourceView.dataSource) &&
            connector &&
            !parentId &&
            space.kind === "system" && (
              <div className="flex flex-col items-center gap-2 text-sm text-element-700">
                {isEmpty && (
                  <div>Connection ready. Select the data to sync.</div>
                )}

                <ConnectorPermissionsModal
                  owner={owner}
                  connector={connector}
                  dataSourceView={dataSourceView}
                  isOpen={showConnectorPermissionsModal}
                  onClose={(save) => {
                    setShowConnectorPermissionsModal(false);
                    if (save) {
                      void mutateContentNodes();
                    }
                  }}
                  readOnly={false}
                  isAdmin={isAdmin}
                  onManageButtonClick={() => {
                    setShowConnectorPermissionsModal(true);
                  }}
                />
              </div>
            )}
        </div>
        {(isNodesLoading || isSearchLoading || isSearchValidating) && (
          <div className="absolute mt-16 flex justify-center">
            <Spinner />
          </div>
        )}
        {rows.length > 0 && (
          <DataTable
            data={rows}
            columns={columns}
            filter={
              // TODO(20250220, search-kb): remove this once the feature flag is enabled by default
              searchFeatureFlag ? undefined : dataSourceSearch
            }
            filterColumn={
              "title" // see todo above
            }
            className={cn(
              "pb-4",
              isSearchValidating && "pointer-events-none opacity-50"
            )}
            sorting={sorting}
            setSorting={setSorting}
            totalRowCount={isServerPagination ? totalNodesCount : undefined}
            rowCountIsCapped={totalNodesCount === ROWS_COUNT_CAPPED}
            pagination={pagination}
            setPagination={setPagination}
            columnsBreakpoints={columnsBreakpoints}
          />
        )}
        {searchFeatureFlag &&
          rows.length === 0 &&
          debouncedSearch.length >= MIN_SEARCH_QUERY_SIZE &&
          !isSearchLoading &&
          !isSearchValidating &&
          !isTyping && (
            <div className="mt-8 flex justify-center">
              <div>No results found</div>
            </div>
          )}
        <ContentActions
          ref={contentActionsRef}
          dataSourceView={dataSourceView}
          totalNodesCount={totalNodesCount}
          owner={owner}
          plan={plan}
          onSave={onSaveAction}
        />
      </DropzoneContainer>
    </FileDropProvider>
  );
};
