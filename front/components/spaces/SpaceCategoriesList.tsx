import {
  ArrowUpOnSquareIcon,
  Button,
  CloudArrowLeftRightIcon,
  cn,
  Cog6ToothIcon,
  CommandLineIcon,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GlobeAltIcon,
  Icon,
  PlusIcon,
  RobotIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import type { ComponentType } from "react";
import React from "react";

import { SpaceSearchContext } from "@app/components/spaces/search/SpaceSearchContext";
import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { MCP_SPECIFICATION } from "@app/lib/actions/utils";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  DataSourceWithAgentsUsageType,
  SpaceType,
  WorkspaceType,
} from "@app/types";
import { DATA_SOURCE_VIEW_CATEGORIES, removeNulls } from "@app/types";

type RowData = {
  category: string;
  name: string;
  icon: ComponentType;
  usage: DataSourceWithAgentsUsageType;
  count: number;
  onClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

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
                  : `Used by ${info.row.original.usage.agents.map((a) => a.name).join(", ")}`
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
  isBuilder: boolean;
  canWriteInSpace: boolean;
  onButtonClick?: () => void;
  onSelect: (category: string) => void;
  owner: WorkspaceType;
  space: SpaceType;
};

export const SpaceCategoriesList = ({
  isAdmin,
  isBuilder,
  onButtonClick,
  canWriteInSpace,
  onSelect,
  owner,
  space,
}: SpaceCategoriesListProps) => {
  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const { setIsSearchDisabled } = React.useContext(SpaceSearchContext);

  const rows: RowData[] = spaceInfo
    ? removeNulls(
        DATA_SOURCE_VIEW_CATEGORIES.map((category) =>
          spaceInfo.categories[category] &&
          hasFeature(CATEGORY_DETAILS[category].flag)
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

  React.useEffect(() => {
    if (rows.length === 0) {
      setIsSearchDisabled(true);
    } else {
      setIsSearchDisabled(false);
    }
  }, [rows.length, setIsSearchDisabled]);

  const { portalToHeader } = useActionButtonsPortal({
    containerId: ACTION_BUTTONS_CONTAINER_ID,
  });

  if (isSpaceInfoLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  const actionButtons = (
    <>
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
            disabled={!isBuilder || !canWriteInSpace}
            href={`/w/${owner.sId}/spaces/${space.sId}/categories/apps`}
            icon={CommandLineIcon}
            label="Create a Dust App"
          />
          <DropdownMenuItem
            disabled={!isAdmin}
            href={`/w/${owner.sId}/spaces/${space.sId}/categories/actions`}
            icon={MCP_SPECIFICATION.cardIcon}
            label="Tools"
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const isEmpty = rows.length === 0;

  return (
    <>
      {isEmpty && (
        <div
          className={cn(
            "flex h-36 w-full items-center justify-center gap-2 rounded-xl",
            "bg-muted-background dark:bg-muted-background-night"
          )}
        >
          {actionButtons}
        </div>
      )}
      {!isEmpty && portalToHeader(actionButtons)}
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          className="pb-4"
          columnsBreakpoints={{
            usage: "md",
          }}
        />
      )}
    </>
  );
};
