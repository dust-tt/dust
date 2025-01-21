import type {DropdownMenuItemProps} from "@dust-tt/sparkle";
import {
  Button,
  Cog6ToothIcon,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SearchInput,
  Spinner,
  useHashParam,
  usePaginationFromUrl
} from "@dust-tt/sparkle";
import type {
  ConnectorType,
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightWorkspaceType,
  PlanType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { isValidContentNodesViewType } from "@dust-tt/types";
import type {
  CellContext,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/router";
import type {MouseEventHandler} from "react";
import * as React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

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
import { useSpaces } from "@app/lib/swr/spaces";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";

type MoreMenuItem = Omit<DropdownMenuItemProps, "children" | "onClick"> & {
  label: string;
  variant?: "default" | "warning";
  onClick?: MouseEventHandler<HTMLDivElement>;
  children?: undefined;
};

type RowData = DataSourceViewContentNode & {
  icon: React.ComponentType;
  onClick?: () => void;
  moreMenuItems?: MoreMenuItem[];
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
      className: "w-36",
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
    cell: (info) => (
      <DataTable.MoreButton moreMenuItems={info.row.original.moreMenuItems} />
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
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [showConnectorPermissionsModal, setShowConnectorPermissionsModal] =
    useState(false);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const contentActionsRef = useRef<ContentActionsRef>(null);

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
    initialPageSize: 25,
  });
  const [viewType, setViewType] = useHashParam("viewType", "documents");
  const router = useRouter();
  const showSpaceUsage =
    dataSourceView.kind === "default" && isManaged(dataSourceView.dataSource);
  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    disabled: !showSpaceUsage,
  });
  const { dataSourceViews } = useDataSourceViews(owner, {
    disabled: !showSpaceUsage,
  });
  const handleViewTypeChange = useCallback(
    (newViewType?: ContentNodesViewType) => {
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

  const isServerPagination =
    isFolder(dataSourceView.dataSource) && !dataSourceSearch;

  const columns = useMemo(
    () => getTableColumns(showSpaceUsage),
    [showSpaceUsage]
  );

  const {
    isNodesLoading,
    mutateRegardlessOfQueryParams: mutateContentNodes,
    nodes,
    totalNodesCount,
  } = useDataSourceViewContentNodes({
    dataSourceView,
    owner,
    parentId,
    pagination: isServerPagination ? pagination : undefined,
    viewType: isValidContentNodesViewType(viewType) ? viewType : "documents",
  });

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

  useEffect(() => {
    if (!isTablesValidating && !isDocumentsValidating) {
      if (isDataSourceManaged) {
        handleViewTypeChange("documents");
        return;
      }
      // If the view only has content in one of the two views, we switch to that view.
      // if both view have content, or neither views have content, we default to documents.
      if (hasTables === true && hasDocuments === false) {
        handleViewTypeChange("tables");
      } else if (hasTables === false && hasDocuments === true) {
        handleViewTypeChange("documents");
      } else if (!viewType) {
        handleViewTypeChange("documents");
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
        moreMenuItems: getMenuItems(
          canReadInSpace,
          canWriteInSpace,
          dataSourceView,
          contentNode,
          contentActionsRef
        ),
      })) || [],
    [
      canWriteInSpace,
      canReadInSpace,
      dataSourceView,
      nodes,
      onSelect,
      spaces,
      dataSourceViews,
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
  const isEmpty = rows.length === 0 && !isNodesLoading;

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
            "flex gap-2",
            isEmpty
              ? "h-36 w-full items-center justify-center rounded-xl bg-muted-background"
              : ""
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
                {!isNodesLoading && rows.length === 0 && (
                  <div>Connection ready. Select the data to sync.</div>
                )}

                <ConnectorPermissionsModal
                  owner={owner}
                  connector={connector}
                  dataSource={dataSourceView.dataSource}
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
        {isNodesLoading && (
          <div className="mt-8 flex justify-center">
            <Spinner />
          </div>
        )}
        {rows.length > 0 && (
          <DataTable
            data={rows}
            columns={columns}
            filter={dataSourceSearch}
            filterColumn="title"
            className="pb-4"
            sorting={sorting}
            setSorting={setSorting}
            totalRowCount={isServerPagination ? totalNodesCount : undefined}
            pagination={pagination}
            setPagination={setPagination}
            columnsBreakpoints={columnsBreakpoints}
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
