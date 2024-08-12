import {
  DataTable,
  FolderIcon,
  GlobeAltIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type { VaultType, WorkspaceType } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useState } from "react";

import { useVaultDataSourceOrViewContent } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type RowData = {
  internalId: string;
  type: string;
  title: string;
  expandable: boolean;
  lastUpdatedAt: number | null;
  onClick?: () => void;
  onMoreClick?: () => void;
};

type VaultDataSourceViewContentListProps = {
  owner: WorkspaceType;
  isAdmin: boolean;
  vault: VaultType;
  dataSourceViewId: string;
  parentId: string | null;
  onSelect: (parentId: string) => void;
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: CellContext<RowData, unknown>) => (
        <DataTable.Cell
          iconClassName="text-emerald-500"
          icon={info.row.original.type === "folder" ? FolderIcon : GlobeAltIcon}
        >
          <span className="font-bold">{info.row.original.title}</span>
        </DataTable.Cell>
      ),
    },
  ];
};

export const VaultDataSourceViewContentList = ({
  owner,
  isAdmin,
  vault,
  dataSourceViewId,
  parentId,
  onSelect,
}: VaultDataSourceViewContentListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { vaultContent, isVaultContentLoading } =
    useVaultDataSourceOrViewContent({
      workspaceId: owner.sId,
      vaultId: vault.sId,
      dataSourceOrViewId: dataSourceViewId,
      type: "data_source_views",
      viewType: "documents",
      parentId,
    });

  const rows: RowData[] =
    vaultContent?.map((v) => ({
      ...v,
      count: 0,
      usage: 0,
      onClick: () => onSelect(v.internalId),
      onMoreClick: () => onSelect(v.internalId),
    })) || [];

  if (isVaultContentLoading) {
    return "loader";
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
          filterColumn={"name"}
        />
      ) : (
        <>No content</>
      )}
    </>
  );
};
