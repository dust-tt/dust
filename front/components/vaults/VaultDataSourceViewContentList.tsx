import {
  ChatBubbleBottomCenterTextIcon,
  DataTable,
  DocumentIcon,
  DocumentTextIcon,
  FolderIcon,
  Searchbar,
  Spinner,
  TableIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useRef, useState } from "react";

import type { ContentActionsRef } from "@app/components/vaults/ContentActions";
import {
  ContentActions,
  getMenuItems,
} from "@app/components/vaults/ContentActions";
import { FoldersHeaderMenu } from "@app/components/vaults/FoldersHeaderMenu";
import { isFolder } from "@app/lib/data_sources";
import { useVaultDataSourceViewContent } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type RowData = {
  internalId: string;
  icon: React.ComponentType;
  title: string;
  expandable: boolean;
  lastUpdatedAt: number | null;
  onClick?: () => void;
};

type VaultDataSourceViewContentListProps = {
  dataSourceView: DataSourceViewType;
  plan: PlanType;
  isAdmin: boolean;
  onSelect: (parentId: string) => void;
  owner: WorkspaceType;
  parentId?: string;
  vault: VaultType;
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "title",
      id: "title",
      cell: (info: CellContext<RowData, unknown>) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          <span className="font-bold">{info.row.original.title}</span>
        </DataTable.CellContent>
      ),
    },
  ];
};

export const VaultDataSourceViewContentList = ({
  dataSourceView,
  plan,
  isAdmin,
  onSelect,
  owner,
  parentId,
  vault,
}: VaultDataSourceViewContentListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const contentActionsRef = useRef<ContentActionsRef>(null);
  const visualTable = {
    file: DocumentTextIcon,
    folder: FolderIcon,
    database: TableIcon,
    channel: ChatBubbleBottomCenterTextIcon,
  };

  const {
    vaultContent,
    isVaultContentLoading,
    mutateVaultDataSourceViewContent,
  } = useVaultDataSourceViewContent({
    dataSourceView,
    filterPermission: "read",
    owner,
    parentId,
    vaultId: vault.sId,
    viewType: "documents", // TODO(GROUP_UI): Do not pass viewType, get all document/tables in one call
  });

  const rows: RowData[] =
    vaultContent?.map((contentNode) => ({
      ...contentNode,
      icon: visualTable[contentNode.type] ?? DocumentIcon,
      onClick: () => {
        if (contentNode.expandable) {
          onSelect(contentNode.internalId);
        }
      },
      moreMenuItems: getMenuItems(
        dataSourceView,
        contentNode,
        contentActionsRef
      ),
    })) || [];

  if (isVaultContentLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner />
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
        )}
        {isFolder(dataSourceView.dataSource) && (
          <FoldersHeaderMenu contentActionsRef={contentActionsRef} />
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn="title"
        />
      )}
      <ContentActions
        ref={contentActionsRef}
        dataSourceView={dataSourceView}
        owner={owner}
        plan={plan}
        onSave={mutateVaultDataSourceViewContent}
      />
    </>
  );
};
