import {
  DataTable,
  FolderIcon,
  GlobeAltIcon,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useState } from "react";

import { useVaultDataSourceViewContent } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type RowData = {
  internalId: string;
  type: string;
  title: string;
  expandable: boolean;
  lastUpdatedAt: number | null;
  onClick?: () => void;
};

type VaultDataSourceViewContentListProps = {
  dataSourceView: DataSourceViewType;
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
        <DataTable.CellContent
          // iconClassName="text-brand"
          icon={info.row.original.type === "folder" ? FolderIcon : GlobeAltIcon}
        >
          <span className="font-bold">{info.row.original.title}</span>
        </DataTable.CellContent>
      ),
    },
  ];
};

export const VaultDataSourceViewContentList = ({
  dataSourceView,
  isAdmin,
  onSelect,
  owner,
  parentId,
  vault,
}: VaultDataSourceViewContentListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { vaultContent, isVaultContentLoading } = useVaultDataSourceViewContent(
    {
      dataSourceView,
      filterPermission: "read",
      owner,
      parentId,
      vaultId: vault.sId,
      viewType: "documents",
    }
  );

  const rows: RowData[] = vaultContent.map((v) => ({
    ...v,
    count: 0,
    usage: 0,
    onClick: () => onSelect(v.internalId),
  }));

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
          <Searchbar
            name="search"
            placeholder="Search (Name)"
            value={dataSourceSearch}
            onChange={(s) => {
              setDataSourceSearch(s);
            }}
          />
        )}
      </div>
      {rows.length > 0 ? (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn={"title"}
        />
      ) : (
        <>No content</>
      )}
    </>
  );
};
