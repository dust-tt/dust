import {
  Button,
  CloudArrowLeftRightIcon,
  CommandLineIcon,
  DataTable,
  FolderIcon,
  GlobeAltIcon,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type { VaultType, WorkspaceType } from "@dust-tt/types";
import { DATA_SOURCE_OR_VIEW_CATEGORIES, removeNulls } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import type { ComponentType, ReactElement } from "react";
import { useState } from "react";

import { useVaultInfo } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type RowData = {
  category: string;
  name: string;
  icon: ComponentType;
  usage: number;
  count: number;
  onClick?: () => void;
  onMoreClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

type VaultCategoriesListProps = {
  owner: WorkspaceType;
  isAdmin: boolean;
  vault: VaultType;
  onSelect: (category: string) => void;
};

export const CATEGORY_DETAILS: {
  [key: string]: {
    label: string;
    icon: ReactElement<{
      className?: string;
    }>;
    dataSourceOrView: "data_sources" | "data_source_views";
  };
} = {
  managed: {
    label: "Connected Data",
    icon: <CloudArrowLeftRightIcon className="text-brand" />,
    dataSourceOrView: "data_source_views",
  },
  files: {
    label: "Folders",
    icon: <FolderIcon className="text-brand" />,
    dataSourceOrView: "data_sources",
  },
  webfolder: {
    label: "Websites",
    icon: <GlobeAltIcon className="text-brand" />,
    dataSourceOrView: "data_sources",
  },
  apps: {
    label: "Apps",
    icon: <CommandLineIcon className="text-brand" />,
    dataSourceOrView: "data_sources",
  },
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: Info) => (
        <DataTable.Cell
          // iconClassName="text-brand"
          icon={info.row.original.icon}
        >
          <span className="font-bold">{info.row.original.name}</span> (
          {info.row.original.count} items)
        </DataTable.Cell>
      ),
    },
    {
      header: "Used by",
      accessorKey: "usage",
      cell: (info: Info) => (
        <>
          {info.row.original.usage ? (
            <DataTable.Cell icon={RobotIcon}>
              {info.row.original.usage}
            </DataTable.Cell>
          ) : null}
        </>
      ),
    },
  ];
};

export const VaultCategoriesList = ({
  owner,
  isAdmin,
  vault,
  onSelect,
}: VaultCategoriesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { vaultInfo, isVaultInfoLoading } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault.sId,
  });

  const rows: RowData[] = vaultInfo
    ? removeNulls(
        DATA_SOURCE_OR_VIEW_CATEGORIES.map((category) =>
          vaultInfo.categories[category]
            ? {
                category,
                ...vaultInfo.categories[category],
                name: CATEGORY_DETAILS[category].label,
                icon: CATEGORY_DETAILS[category].icon.type as ComponentType,
                onClick: () => onSelect(category),
                onMoreClick: () => {},
              }
            : null
        )
      )
    : [];

  if (isVaultInfoLoading) {
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
        <Button label="Add Data" onClick={() => {}} />
      </div>
      {rows.length > 0 ? (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn={"name"}
        />
      ) : !isAdmin ? (
        <div className="flex items-center justify-center text-sm font-normal text-element-700">
          No available connection
        </div>
      ) : (
        <></>
      )}
    </>
  );
};
