import {
  Button,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DataTable,
  FolderIcon,
  GlobeAltIcon,
  RobotIcon,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  DataSourceUsageType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { DATA_SOURCE_VIEW_CATEGORIES, removeNulls } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import type { ComponentType } from "react";
import { useState } from "react";

import { useVaultInfo } from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";

type RowData = {
  category: string;
  name: string;
  icon: ComponentType;
  usage: DataSourceUsageType;
  count: number;
  onClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

type VaultCategoriesListProps = {
  owner: WorkspaceType;
  vault: VaultType;
  onSelect: (category: string) => void;
  onButtonClick?: () => void;
};

export const CATEGORY_DETAILS: {
  [key: string]: {
    label: string;
    icon: ComponentType<{
      className?: string;
    }>;
  };
} = {
  managed: {
    label: "Connected Data",
    icon: CloudArrowLeftRightIcon,
  },
  folder: {
    label: "Folders",
    icon: FolderIcon,
  },
  website: {
    label: "Websites",
    icon: GlobeAltIcon,
  },
  apps: {
    label: "Apps",
    icon: CommandLineIcon,
  },
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: Info) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          <span>{info.row.original.name}</span> ({info.row.original.count}{" "}
          items)
        </DataTable.CellContent>
      ),
    },
    {
      header: "Used by",
      accessorKey: "usage",
      meta: {
        width: "6rem",
      },
      cell: (info: Info) => (
        <>
          {info.row.original.usage ? (
            <DataTable.CellContent
              icon={RobotIcon}
              title={`Used by ${info.row.original.usage.agentNames.join(", ")}`}
            >
              {info.row.original.usage.count}
            </DataTable.CellContent>
          ) : null}
        </>
      ),
    },
  ];
};

export const VaultCategoriesList = ({
  owner,
  vault,
  onSelect,
  onButtonClick,
}: VaultCategoriesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { vaultInfo, isVaultInfoLoading } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault.sId,
  });

  const rows: RowData[] = vaultInfo
    ? removeNulls(
        DATA_SOURCE_VIEW_CATEGORIES.map((category) =>
          vaultInfo.categories[category]
            ? {
                category,
                ...vaultInfo.categories[category],
                name: CATEGORY_DETAILS[category].label,
                icon: CATEGORY_DETAILS[category].icon,
                onClick: () => onSelect(category),
              }
            : null
        )
      )
    : [];

  if (isVaultInfoLoading) {
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
          rows.length === 0
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
        {onButtonClick && vault.kind === "regular" && (
          <Button
            label="Settings and Members"
            icon={Cog6ToothIcon}
            onClick={onButtonClick}
          />
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn={"name"}
          columnsBreakpoints={{
            usage: "md",
          }}
        />
      )}
    </>
  );
};
