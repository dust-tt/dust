import {
  Checkbox,
  DataTable,
  Icon,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useMemo } from "react";

import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { emptyArray } from "@app/lib/swr/swr";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { WorkspaceType } from "@app/types";
import type {
  DataSourceViewCategory,
  DataSourceViewCategoryWithoutApps,
  DataSourceWithAgentsUsageType,
  SpaceType,
  WhitelistableFeature,
} from "@app/types";
import {
  DATA_SOURCE_VIEW_CATEGORIES,
  isDataSourceViewCategoryWithoutApps,
  removeNulls,
} from "@app/types";

interface CategoryRowData {
  id: string;
  title: string;
  onClick: () => void;
  icon: React.JSX.Element;
}

interface DataSourceCategoryBrowserProps {
  owner: WorkspaceType;
  space: SpaceType;
  onSelectCategory: (category: DataSourceViewCategoryWithoutApps) => void;
}

export function DataSourceCategoryBrowser({
  owner,
  space,
  onSelectCategory,
}: DataSourceCategoryBrowserProps) {
  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const {
    selectNode,
    selectCurrentNavigationEntry,
    removeNode,
    removeCurrentNavigationEntry,
    isRowSelected,
    isCurrentNavigationEntrySelected,
  } = useDataSourceBuilderContext();

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const categoryRows = useMemo(() => {
    if (!isSpaceInfoLoading && spaceInfo) {
      return getCategoryRows(spaceInfo.categories, hasFeature, (category) => {
        if (isDataSourceViewCategoryWithoutApps(category)) {
          onSelectCategory(category);
        }
      });
    }
    return emptyArray<CategoryRowData>();
  }, [hasFeature, isSpaceInfoLoading, onSelectCategory, spaceInfo]);

  const columns: ColumnDef<CategoryRowData>[] = useMemo(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: () => (
          <Checkbox
            size="xs"
            checked={isCurrentNavigationEntrySelected()}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(state) => {
              if (state === "indeterminate") {
                removeCurrentNavigationEntry();
                return;
              }

              if (state) {
                selectCurrentNavigationEntry();
              } else {
                removeCurrentNavigationEntry();
              }
            }}
          />
        ),
        cell: ({ row }) => (
          <div className="flex h-full items-center">
            <Checkbox
              size="xs"
              checked={isRowSelected(row.original.id)}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(state) => {
                if (state === "indeterminate") {
                  removeNode(row.original.id);
                  return;
                }

                if (state) {
                  selectNode(row.original.id);
                } else {
                  removeNode(row.original.id);
                }
              }}
            />
          </div>
        ),
        meta: {
          sizeRatio: 5,
        },
      },
      {
        accessorKey: "title",
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <DataTable.CellContent>
            <span className="flex items-center gap-2 truncate text-ellipsis font-semibold">
              {row.original.icon}
              {row.original.title}
            </span>
          </DataTable.CellContent>
        ),
        meta: {
          sizeRatio: 100,
        },
      },
    ],
    [
      isCurrentNavigationEntrySelected,
      isRowSelected,
      removeCurrentNavigationEntry,
      removeNode,
      selectCurrentNavigationEntry,
      selectNode,
    ]
  );

  if (isSpaceInfoLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <ScrollableDataTable
      data={categoryRows}
      columns={columns}
      getRowId={(originalRow) => originalRow.id}
    />
  );
}

type SpaceCategory = {
  [p: string]: {
    usage: DataSourceWithAgentsUsageType;
    count: number;
  };
};

function getCategoryRows(
  spaceCategories: SpaceCategory,
  hasFeature: (flag: WhitelistableFeature | null | undefined) => boolean,
  onSelect: (category: DataSourceViewCategory) => void
): CategoryRowData[] {
  return spaceCategories
    ? removeNulls(
        DATA_SOURCE_VIEW_CATEGORIES.map((category) =>
          spaceCategories[category] &&
          hasFeature(CATEGORY_DETAILS[category].flag) &&
          isDataSourceViewCategoryWithoutApps(category)
            ? {
                id: category,
                title: CATEGORY_DETAILS[category].label,
                icon: <Icon visual={CATEGORY_DETAILS[category].icon} />,
                onClick: () => onSelect(category),
              }
            : null
        )
      )
    : [];
}
