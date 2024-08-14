import {
  Button,
  DataTable,
  FolderIcon,
  GlobeAltIcon,
  PlusIcon,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
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

type VaultDataSourceContentListProps = {
  owner: WorkspaceType;
  isAdmin: boolean;
  vault: VaultType;
  dataSourceId: string;
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
          // iconClassName="text-brand"
          icon={info.row.original.type === "folder" ? FolderIcon : GlobeAltIcon}
        >
          <span className="font-bold">{info.row.original.title}</span>
        </DataTable.Cell>
      ),
    },
  ];
};

export const VaultDataSourceContentList = ({
  owner,
  isAdmin,
  vault,
  dataSourceId,
  parentId,
  onSelect,
}: VaultDataSourceContentListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const [viewType] = useState<ContentNodesViewType>("documents");
  const { vaultContent, isVaultContentLoading } =
    useVaultDataSourceOrViewContent({
      workspaceId: owner.sId,
      vaultId: vault.sId,
      dataSourceOrViewId: dataSourceId,
      type: "data_sources",
      viewType: viewType,
      parentId,
    });

  const router = useRouter();

  const rows: RowData[] =
    vaultContent?.map((v) => ({
      ...v,
      count: 0,
      usage: 0,
      onClick: v.type === "folder" ? () => onSelect(v.internalId) : undefined,
      onMoreClick: () => onSelect(v.internalId),
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
        {rows.length > 0 ? (
          <Searchbar
            name="search"
            placeholder="Search (Name)"
            value={dataSourceSearch}
            onChange={(s) => {
              setDataSourceSearch(s);
            }}
          />
        ) : (
          <Button
            label="Add data to folder"
            icon={PlusIcon}
            onClick={() => {
              void router.push(
                `/w/${owner.sId}/builder/data-sources/${dataSourceId}`
              );
            }}
          />
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn={"name"}
        />
      )}
    </>
  );
};
