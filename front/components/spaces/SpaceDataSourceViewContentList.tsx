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
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/router";
import * as React from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { ConnectorPermissionsModal } from "@app/components/data_source/ConnectorPermissionsModal";
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
import { SpaceSearchContext } from "@app/components/spaces/search/SpaceSearchContext";
import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { WebsitesHeaderMenu } from "@app/components/spaces/WebsitesHeaderMenu";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import { useHashParam } from "@app/hooks/useHashParams";
import { useSendNotification } from "@app/hooks/useNotification";
import { usePeriodicRefresh } from "@app/hooks/usePeriodicRefresh";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { isFolder, isManaged, isWebsite } from "@app/lib/data_sources";
import {
  useDataSourceViewContentNodes,
  useDataSourceViews,
} from "@app/lib/swr/data_source_views";
import { useSpaces } from "@app/lib/swr/spaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
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
} from "@app/types";
import { isValidContentNodesViewType } from "@app/types";

const DEFAULT_VIEW_TYPE = "all";
const PAGE_SIZE = 100;

type RowData = DataSourceViewContentNode & {
  icon: React.ComponentType;
  onClick?: () => void;
  menuItems?: MenuItem[];
};

const columnsBreakpoints = {
  lastUpdatedAt: "sm" as const,
  spaces: "md" as const,
};

function isMicrosoftNode(row: RowData) {
  return row.dataSourceView.dataSource.connectorProvider === "microsoft";
}

/**
 * Microsoft root folders' titles do not contain the sites / unsynced parent
 * directory information, which had caused usability issues, see
 * https://github.com/dust-tt/tasks/issues/2619
 *
 * As such we extract title from the sourceUrl rather than using titles
 * directly.
 *
 * TODO(pr, 2025-04-18): if solution is satisfactory, change the title field for
 * microsoft directly in connectors + backfill, then remove this logic.
 */
function getTitleForMicrosoftNode(row: RowData) {
  if (
    row.parentInternalId !== null ||
    row.type !== "folder" ||
    !row.sourceUrl
  ) {
    return row.title;
  }
  // remove the trailing url in parenthesis
  //title = title.replace(/\s*\([^\)\()]*\)\s*$/, "");

  // extract the title from the sourceUrl
  const url = new URL(row.sourceUrl);
  const decodedPathname = decodeURIComponent(url.pathname);
  const title = decodedPathname.split("/").slice(2).join("/");
  return title;
}
const getTableColumns = (showSpaceUsage: boolean): ColumnDef<RowData>[] => {
  const columns: ColumnDef<RowData, any>[] = [];
  columns.push({
    header: "Name",
    id: "title",
    accessorFn: (row) => {
      if (isMicrosoftNode(row)) {
        return getTitleForMicrosoftNode(row);
      }
      return row.title;
    },
    sortingFn: (a, b, columnId) => {
      const aValue = a.getValue(columnId) as string;
      const bValue = b.getValue(columnId) as string;
      return aValue.localeCompare(bValue) > 0 ? -1 : 1;
    },
    cell: (info: CellContext<RowData, string>) => (
      <DataTable.CellContent icon={info.row.original.icon}>
        <Tooltip
          label={info.getValue()}
          trigger={<span>{info.getValue()}</span>}
        />
      </DataTable.CellContent>
    ),
  });

  if (showSpaceUsage) {
    columns.push({
      id: "spaces",
      accessorKey: "spaces",
      meta: {
        className: "w-48",
      },
      header: () => {
        return (
          <div className="flex w-full justify-end">
            <p>Available to</p>
          </div>
        );
      },
      cell: (info: CellContext<RowData, SpaceType[]>) => (
        <DataTable.BasicCellContent
          className="justify-end"
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
    enableSorting: true,
    meta: {
      className: "w-24",
    },
    cell: (info: CellContext<RowData, number>) => (
      <DataTable.BasicCellContent
        className="justify-end"
        label={
          info.getValue()
            ? formatTimestampToFriendlyDate(info.getValue(), "compactWithDay")
            : "-"
        }
        tooltip={
          info.getValue()
            ? formatTimestampToFriendlyDate(info.getValue(), "long")
            : "-"
        }
      />
    ),
  });

  columns.push({
    id: "actions",
    meta: {
      className: "w-16",
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
        cursor: null,
        limit: 1,
      },
      viewType,
    });

  return {
    hasContent: isManaged(dataSourceView.dataSource) ? true : !!nodes?.length,
    isLoading: isManaged(dataSourceView.dataSource) ? false : isNodesLoading,
    isNodesValidating,
  };
}

interface SpaceDataSourceViewContentListProps {
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
}

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
  const [showConnectorPermissionsModal, setShowConnectorPermissionsModal] =
    useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const sendNotification = useSendNotification();
  const contentActionsRef = useRef<ContentActionsRef>(null);

  const {
    cursorPagination,
    resetPagination,
    handlePaginationChange,
    tablePagination,
  } = useCursorPaginationForDataTable(PAGE_SIZE);

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
        resetPagination();
        setViewType(newViewType);
      }
    },
    [resetPagination, setViewType, viewType]
  );

  const sortingAsString = useMemo(() => JSON.stringify(sorting), [sorting]);

  // Reset pagination when sorting changes
  useEffect(() => {
    resetPagination();
  }, [sortingAsString, resetPagination]);

  const { setIsSearchDisabled } = useContext(SpaceSearchContext);

  const columns = useMemo(
    () => getTableColumns(showSpaceUsage),
    [showSpaceUsage]
  );

  // Convert DataTable sorting format to our API format
  const apiSorting = sorting.map((sort) => ({
    field: sort.id,
    direction: sort.desc ? ("desc" as const) : ("asc" as const),
  }));

  const {
    isNodesLoading,
    mutateRegardlessOfQueryParams: mutateContentNodes,
    nodes: childrenNodes,
    nextPageCursor,
    totalNodesCount,
    totalNodesCountIsAccurate,
  } = useDataSourceViewContentNodes({
    dataSourceView,
    owner,
    parentId,
    pagination: { cursor: cursorPagination.cursor, limit: PAGE_SIZE },
    viewType: isValidContentNodesViewType(viewType)
      ? viewType
      : DEFAULT_VIEW_TYPE,
    sorting: apiSorting,
  });

  const { startPeriodicRefresh } = usePeriodicRefresh(mutateContentNodes);

  const { hasContent: hasDocuments, isNodesValidating: isDocumentsValidating } =
    useStaticDataSourceViewHasContent({
      owner,
      dataSourceView,
      parentId,
      viewType: "document",
    });
  const { hasContent: hasTables, isNodesValidating: isTablesValidating } =
    useStaticDataSourceViewHasContent({
      owner,
      dataSourceView,
      parentId,
      viewType: "table",
    });

  useEffect(() => {
    if (childrenNodes.length === 0) {
      setIsSearchDisabled(true);
    } else {
      setIsSearchDisabled(false);
    }
  }, [childrenNodes.length, setIsSearchDisabled]);

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
      // if both views have content, or neither view has content, we default to documents.
      if (hasTables && !hasDocuments) {
        handleViewTypeChange("table");
      } else if (!hasTables && hasDocuments) {
        handleViewTypeChange("document");
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

  const rows: RowData[] = useMemo(
    () =>
      childrenNodes?.map((contentNode) => ({
        ...contentNode,
        icon: getVisualForDataSourceViewContentNode(contentNode),
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
          addToSpace,
          router
        ),
      })) || [],
    [
      childrenNodes,
      spaces,
      canReadInSpace,
      canWriteInSpace,
      dataSourceView,
      dataSourceViews,
      addToSpace,
      router,
      onSelect,
    ]
  );

  const onSelectedDataUpdated = useCallback(async () => {
    await mutateContentNodes();
  }, [mutateContentNodes]);

  const onSaveAction = useCallback(
    async (action?: ContentActionKey) => {
      await mutateContentNodes();

      // Since the content nodes have changed, we start a periodic refresh to ensure
      // that any ongoing processing (e.g., file uploads) is reflected in the UI.
      startPeriodicRefresh();

      if (
        action === "DocumentUploadOrEdit" ||
        action === "MultipleDocumentsUpload"
      ) {
        handleViewTypeChange("document");
      } else if (action === "TableUploadOrEdit") {
        handleViewTypeChange("table");
      }
    },
    [handleViewTypeChange, mutateContentNodes, startPeriodicRefresh]
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

  const { portalToHeader } = useActionButtonsPortal({
    containerId: ACTION_BUTTONS_CONTAINER_ID,
  });

  const emptyContent = parentId ? <div>No content</div> : emptySpaceContent;
  const isEmpty = rows.length === 0 && !isNodesLoading;

  const actionButtons = (
    <>
      {isFolder(dataSourceView.dataSource) && (
        <>
          {((viewType === "table" && hasDocuments) ||
            (viewType === "document" && hasTables)) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  label={viewType === "document" ? "document" : "table"}
                  variant="outline"
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label="Documents"
                  onClick={() => handleViewTypeChange("document")}
                />
                <DropdownMenuItem
                  label="Tables"
                  onClick={() => handleViewTypeChange("table")}
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
      {isManaged(dataSourceView.dataSource) && space.kind !== "system" && (
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
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
            {isEmpty && <div>Connection ready. Select the data to sync.</div>}

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
    </>
  );

  return (
    // MultipleDocumentsUpload listens to the file drop context and uploads the files.
    <FileDropProvider>
      <DropzoneContainer
        description="Drag and drop your files here."
        title="Add Files"
        disabled={!canWriteInSpace}
      >
        {isEmpty && (
          <div
            className={cn(
              "flex w-full gap-2",
              "h-36 items-center justify-center rounded-xl",
              "bg-muted-background dark:bg-muted-background-night"
            )}
          >
            {emptyContent}
            {actionButtons}
          </div>
        )}
        {/* Portal buttons next to the search bar if not empty. */}
        {!isEmpty && portalToHeader(actionButtons)}

        {isNodesLoading && (
          <div className="absolute mt-16 flex justify-center">
            <Spinner />
          </div>
        )}
        {rows.length > 0 && (
          <DataTable
            data={rows}
            columns={columns}
            className="dd-privacy-mask pb-4"
            totalRowCount={totalNodesCount}
            rowCountIsCapped={!totalNodesCountIsAccurate}
            pagination={tablePagination}
            setPagination={(newTablePagination) =>
              handlePaginationChange(newTablePagination, nextPageCursor)
            }
            sorting={sorting}
            setSorting={setSorting}
            isServerSideSorting={true}
            columnsBreakpoints={columnsBreakpoints}
            disablePaginationNumbers
          />
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
