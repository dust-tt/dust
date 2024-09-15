import {
  Button,
  Cog6ToothIcon,
  DataTable,
  DropdownMenu,
  Searchbar,
  Spinner,
  useHashParam,
  usePaginationFromUrl,
} from "@dust-tt/sparkle";
import type {
  ConnectorType,
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewType,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { isValidContentNodesViewType } from "@dust-tt/types";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useMemo, useRef, useState } from "react";

import { ConnectorPermissionsModal } from "@app/components/ConnectorPermissionsModal";
import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import type {
  ContentActionKey,
  ContentActionsRef,
} from "@app/components/vaults/ContentActions";
import {
  ContentActions,
  getMenuItems,
} from "@app/components/vaults/ContentActions";
import { FoldersHeaderMenu } from "@app/components/vaults/FoldersHeaderMenu";
import { WebsitesHeaderMenu } from "@app/components/vaults/WebsitesHeaderMenu";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import { isFolder, isManaged, isWebsite } from "@app/lib/data_sources";
import {
  useDataSourceViewContentNodes,
  useDataSourceViews,
} from "@app/lib/swr/data_source_views";
import { useSystemVault, useVaults } from "@app/lib/swr/vaults";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";

type RowData = DataSourceViewContentNode & {
  icon: React.ComponentType;
  onClick?: () => void;
};

type VaultDataSourceViewContentListProps = {
  vault: VaultType;
  dataSourceView: DataSourceViewType;
  plan: PlanType;
  canWriteInVault: boolean;
  canReadInVault: boolean;
  onSelect: (parentId: string) => void;
  owner: WorkspaceType;
  parentId?: string;
  isAdmin: boolean;
  dustClientFacingUrl: string;
  connector: ConnectorType | null;
};

const getTableColumns = (showVaultUsage: boolean): ColumnDef<RowData>[] => {
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

  if (showVaultUsage) {
    columns.push({
      header: "Available to",
      accessorKey: "vaults",
      meta: {
        width: "14rem",
      },
      cell: (info: CellContext<RowData, VaultType[]>) => (
        <DataTable.CellContent>
          {info.getValue().length > 0
            ? info
                .getValue()
                .map((v) => v.name)
                .join(",")
            : "-"}
        </DataTable.CellContent>
      ),
    });
  }

  columns.push({
    header: "Last updated",
    accessorKey: "lastUpdatedAt",
    id: "lastUpdatedAt",
    meta: {
      width: "12rem",
    },
    cell: (info: CellContext<RowData, number>) => (
      <DataTable.CellContent>
        {info.getValue()
          ? formatTimestampToFriendlyDate(info.getValue(), "short")
          : "-"}
      </DataTable.CellContent>
    ),
  });

  return columns;
};

export const VaultDataSourceViewContentList = ({
  owner,
  vault,
  dataSourceView,
  plan,
  canWriteInVault,
  canReadInVault,
  onSelect,
  parentId,
  isAdmin,
  dustClientFacingUrl,
  connector,
}: VaultDataSourceViewContentListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [showConnectorPermissionsModal, setShowConnectorPermissionsModal] =
    useState(false);
  const contentActionsRef = useRef<ContentActionsRef>(null);

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });
  const [viewType, setViewType] = useHashParam("viewType", "documents");
  const router = useRouter();
  const showVaultUsage =
    dataSourceView.kind === "default" && isManaged(dataSourceView.dataSource);
  const { vaults } = useVaults({
    workspaceId: owner.sId,
    disabled: !showVaultUsage,
  });
  const { dataSourceViews } = useDataSourceViews(owner, {
    disabled: !showVaultUsage,
  });

  const { systemVault } = useSystemVault({
    workspaceId: owner.sId,
  });

  const handleViewTypeChange = (newViewType: ContentNodesViewType) => {
    if (newViewType !== viewType) {
      setPagination({ pageIndex: 0, pageSize: pagination.pageSize }, "replace");
      setViewType(newViewType);
    }
  };

  const {
    isNodesLoading,
    mutateDataSourceViewContentNodes,
    nodes,
    totalNodesCount,
  } = useDataSourceViewContentNodes({
    dataSourceView,
    owner,
    internalIds: parentId ? [parentId] : undefined,
    includeChildren: true,
    pagination,
    viewType: isValidContentNodesViewType(viewType) ? viewType : "documents",
  });

  const rows: RowData[] = useMemo(
    () =>
      nodes?.map((contentNode) => ({
        ...contentNode,
        icon: getVisualForContentNode(contentNode),
        vaults: vaults.filter((vault) =>
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
            .map((dsv) => dsv.vaultId)
            .includes(vault.sId)
        ),
        ...(contentNode.expandable && {
          onClick: () => {
            if (contentNode.expandable) {
              onSelect(contentNode.internalId);
            }
          },
        }),
        moreMenuItems: getMenuItems(
          canReadInVault,
          canWriteInVault,
          dataSourceView,
          contentNode,
          contentActionsRef
        ),
      })) || [],
    [
      canWriteInVault,
      canReadInVault,
      dataSourceView,
      nodes,
      onSelect,
      vaults,
      dataSourceViews,
    ]
  );

  if (isNodesLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  const emptyVaultContent =
    vault.kind !== "system" ? (
      isAdmin ? (
        <Button
          label="Manage Data"
          icon={Cog6ToothIcon}
          onClick={() => {
            if (systemVault) {
              void router.push(
                `/w/${owner.sId}/vaults/${systemVault.sId}/categories/${dataSourceView.category}`
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

  return (
    <>
      <div
        className={classNames(
          "flex gap-2",
          rows.length === 0
            ? "h-36 w-full max-w-4xl items-center justify-center rounded-lg border bg-structure-50"
            : ""
        )}
      >
        {rows.length > 0 ? (
          <>
            <Searchbar
              name="search"
              placeholder="Search (Name)"
              value={dataSourceSearch}
              onChange={(s) => {
                setDataSourceSearch(s);
              }}
            />
          </>
        ) : (
          emptyVaultContent
        )}
        {isFolder(dataSourceView.dataSource) && (
          <>
            {rows.length > 0 && (
              <DropdownMenu>
                <DropdownMenu.Button>
                  <Button
                    size="sm"
                    label={viewType === "documents" ? "Documents" : "Tables"}
                    variant="secondary"
                    type="menu"
                  />
                </DropdownMenu.Button>

                <DropdownMenu.Items>
                  <DropdownMenu.Item
                    label="Documents"
                    onClick={() => handleViewTypeChange("documents")}
                  />
                  <DropdownMenu.Item
                    label="Tables"
                    onClick={() => handleViewTypeChange("tables")}
                  />
                </DropdownMenu.Items>
              </DropdownMenu>
            )}
            <FoldersHeaderMenu
              owner={owner}
              vault={vault}
              canWriteInVault={canWriteInVault}
              folder={dataSourceView.dataSource}
              contentActionsRef={contentActionsRef}
            />
          </>
        )}
        {isWebsite(dataSourceView.dataSource) && (
          <WebsitesHeaderMenu
            owner={owner}
            vault={vault}
            canWriteInVault={canWriteInVault}
            dataSourceView={dataSourceView}
          />
        )}
        {isManaged(dataSourceView.dataSource) &&
          connector &&
          !parentId &&
          vault.kind === "system" && (
            <div className="flex flex-col items-center gap-2 text-sm text-element-700">
              {rows.length === 0 && (
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
                    void mutateDataSourceViewContentNodes();
                  }
                }}
                plan={plan}
                readOnly={false}
                isAdmin={isAdmin}
                dustClientFacingUrl={dustClientFacingUrl}
                onManageButtonClick={() => {
                  setShowConnectorPermissionsModal(true);
                }}
              />
            </div>
          )}
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns(showVaultUsage)}
          filter={dataSourceSearch}
          filterColumn="title"
          initialColumnOrder={[{ desc: false, id: "title" }]}
          totalRowCount={totalNodesCount}
          pagination={pagination}
          setPagination={setPagination}
        />
      )}
      <ContentActions
        ref={contentActionsRef}
        dataSourceView={dataSourceView}
        totalNodesCount={totalNodesCount}
        owner={owner}
        plan={plan}
        onSave={async (action?: ContentActionKey) => {
          if (action === "DocumentUploadOrEdit") {
            handleViewTypeChange("documents");
          } else if (action === "TableUploadOrEdit") {
            handleViewTypeChange("tables");
          }
          await mutateDataSourceViewContentNodes();
        }}
      />
    </>
  );
};
