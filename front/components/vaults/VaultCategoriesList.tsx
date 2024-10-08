import {
  ArrowUpOnSquareIcon,
  Button,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DataTable,
  DropdownMenu,
  FolderIcon,
  GlobeAltIcon,
  PlusIcon,
  RobotIcon,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewCategory,
  DataSourceWithAgentsUsageType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { DATA_SOURCE_VIEW_CATEGORIES, removeNulls } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useState } from "react";

import { useVaultInfo } from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";

type RowData = {
  category: string;
  name: string;
  icon: ComponentType;
  usage: DataSourceWithAgentsUsageType;
  count: number;
  onClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

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
      accessorFn: (row: RowData) => row.usage.count,
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

type VaultCategoriesListProps = {
  isAdmin: boolean;
  onButtonClick?: () => void;
  onSelect: (category: string) => void;
  owner: WorkspaceType;
  vault: VaultType;
};

export const VaultCategoriesList = ({
  isAdmin,
  onButtonClick,
  onSelect,
  owner,
  vault,
}: VaultCategoriesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { vaultInfo, isVaultInfoLoading } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault.sId,
  });
  const router = useRouter();

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

  const redirectTo = (category: DataSourceViewCategory) => {
    void router.push(
      `/w/${owner.sId}/vaults/${vault.sId}/categories/${category}`
    );
  };

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
          <div className="flex w-full gap-2">
            <Searchbar
              name="search"
              placeholder="Search (Name)"
              value={dataSourceSearch}
              onChange={(s) => {
                setDataSourceSearch(s);
              }}
            />
            {isAdmin && onButtonClick && vault.kind === "regular" && (
              <Button
                label="Settings and Members"
                icon={Cog6ToothIcon}
                onClick={onButtonClick}
                variant="tertiary"
              />
            )}
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button label="Add data" icon={PlusIcon} />
              </DropdownMenu.Button>
              <DropdownMenu.Items width={200}>
                <DropdownMenu.Item
                  label="Connected Data"
                  icon={CloudArrowLeftRightIcon}
                  onClick={() => {
                    redirectTo("managed");
                  }}
                />
                <DropdownMenu.Item
                  label="Upload Data"
                  icon={ArrowUpOnSquareIcon}
                  onClick={() => {
                    redirectTo("folder");
                  }}
                />
                <DropdownMenu.Item
                  label="Scrap a website"
                  icon={GlobeAltIcon}
                  onClick={() => {
                    redirectTo("website");
                  }}
                />
                <DropdownMenu.Item
                  label="Create a Dust App"
                  icon={CommandLineIcon}
                  onClick={() => {
                    redirectTo("apps");
                  }}
                />
              </DropdownMenu.Items>
            </DropdownMenu>
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          className="pb-4"
          filter={dataSourceSearch}
          filterColumn="name"
          columnsBreakpoints={{
            usage: "md",
          }}
        />
      )}
    </>
  );
};
