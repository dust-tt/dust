import {
  ArrowUpOnSquareIcon,
  Button,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderIcon,
  GlobeAltIcon,
  Icon,
  PlusIcon,
  RobotIcon,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  DataSourceWithAgentsUsageType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { DATA_SOURCE_VIEW_CATEGORIES, removeNulls } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import type { ComponentType } from "react";
import { useState } from "react";

import { useSpaceInfo } from "@app/lib/swr/spaces";
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
        <DataTable.CellContent
          icon={info.row.original.icon}
          description={`(${info.row.original.count})`}
        >
          {info.row.original.name}
        </DataTable.CellContent>
      ),
    },
    {
      header: "Used by",
      accessorFn: (row: RowData) => row.usage.count,
      meta: {
        className: "w-24",
      },
      cell: (info: Info) => (
        <>
          {info.row.original.usage ? (
            <DataTable.CellContent
              title={
                info.row.original.usage.count === 0
                  ? "Un-used"
                  : `Used by ${info.row.original.usage.agentNames.join(", ")}`
              }
            >
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon visual={RobotIcon} size="xs" />
                {info.row.original.usage.count}
              </span>
            </DataTable.CellContent>
          ) : null}
        </>
      ),
    },
  ];
};

type SpaceCategoriesListProps = {
  isAdmin: boolean;
  canWriteInSpace: boolean;
  onButtonClick?: () => void;
  onSelect: (category: string) => void;
  owner: WorkspaceType;
  space: SpaceType;
};

export const SpaceCategoriesList = ({
  isAdmin,
  onButtonClick,
  canWriteInSpace,
  onSelect,
  owner,
  space,
}: SpaceCategoriesListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");

  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const rows: RowData[] = spaceInfo
    ? removeNulls(
        DATA_SOURCE_VIEW_CATEGORIES.map((category) =>
          spaceInfo.categories[category]
            ? {
                category,
                ...spaceInfo.categories[category],
                name: CATEGORY_DETAILS[category].label,
                icon: CATEGORY_DETAILS[category].icon,
                onClick: () => onSelect(category),
              }
            : null
        )
      )
    : [];

  if (isSpaceInfoLoading) {
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
            ? classNames(
                "h-36 w-full items-center justify-center rounded-xl",
                "bg-muted-background dark:bg-muted-background-night"
              )
            : ""
        )}
      >
        {rows.length > 0 && (
          <div className="flex w-full gap-2">
            <SearchInput
              name="search"
              placeholder="Search (Name)"
              value={dataSourceSearch}
              onChange={(s) => {
                setDataSourceSearch(s);
              }}
            />
            {isAdmin && onButtonClick && space.kind === "regular" && (
              <Button
                label="Space settings"
                icon={Cog6ToothIcon}
                onClick={onButtonClick}
                variant="outline"
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button label="Add data" icon={PlusIcon} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  disabled={!isAdmin && !canWriteInSpace}
                  href={`/w/${owner.sId}/spaces/${space.sId}/categories/managed`}
                  icon={CloudArrowLeftRightIcon}
                  label="Connected Data"
                />
                <DropdownMenuItem
                  disabled={!canWriteInSpace}
                  href={`/w/${owner.sId}/spaces/${space.sId}/categories/folder`}
                  icon={ArrowUpOnSquareIcon}
                  label="Upload Data"
                />
                <DropdownMenuItem
                  disabled={!canWriteInSpace}
                  href={`/w/${owner.sId}/spaces/${space.sId}/categories/website`}
                  icon={GlobeAltIcon}
                  label="Scrape a website"
                />
                <DropdownMenuItem
                  disabled={!canWriteInSpace}
                  href={`/w/${owner.sId}/spaces/${space.sId}/categories/apps`}
                  icon={CommandLineIcon}
                  label="Create a Dust App"
                />
              </DropdownMenuContent>
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
