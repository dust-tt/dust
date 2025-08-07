import {
  Checkbox,
  DataTable,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useMemo } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { emptyArray } from "@app/lib/swr/swr";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
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
  id: DataSourceViewCategoryWithoutApps;
  title: string;
  onClick: () => void;
  icon: React.ComponentType;
}

interface DataSourceCategoryBrowserProps {
  space: SpaceType;
}

export function DataSourceCategoryBrowser({
  space,
}: DataSourceCategoryBrowserProps) {
  const { owner } = useAgentBuilderContext();
  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const {
    selectNode,
    setCategoryEntry,
    selectCurrentNavigationEntry,
    removeNode,
    removeCurrentNavigationEntry,
    isRowSelected,
    isRowSelectable,
    isCurrentNavigationEntrySelected,
  } = useDataSourceBuilderContext();

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const categoryRows = useMemo(() => {
    if (!isSpaceInfoLoading && spaceInfo) {
      return getCategoryRows(spaceInfo.categories, hasFeature, (category) => {
        if (isDataSourceViewCategoryWithoutApps(category)) {
          setCategoryEntry(category);
        }
      });
    }
    return emptyArray<CategoryRowData>();
  }, [hasFeature, isSpaceInfoLoading, setCategoryEntry, spaceInfo]);

  const columns: ColumnDef<CategoryRowData>[] = useMemo(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: () => {
          const selectionState = isCurrentNavigationEntrySelected();

          return (
            <Checkbox
              size="xs"
              checked={selectionState}
              disabled={!isRowSelectable()}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(state) => {
                if (selectionState === "partial" || state) {
                  selectCurrentNavigationEntry();
                } else {
                  removeCurrentNavigationEntry();
                }
              }}
            />
          );
        },
        cell: ({ row }) => {
          const selectionState = isRowSelected(row.original.id);

          return (
            <div className="flex h-full items-center">
              <Checkbox
                size="xs"
                checked={selectionState}
                disabled={!isRowSelectable(row.original.id)}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(state) => {
                  if (selectionState === "partial" || state) {
                    selectNode({ type: "category", category: row.original.id });
                  } else {
                    removeNode({ type: "category", category: row.original.id });
                  }
                }}
              />
            </div>
          );
        },
        meta: {
          sizeRatio: 5,
        },
      },
      {
        accessorKey: "title",
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <DataTable.CellContent icon={row.original.icon}>
            {row.original.title}
          </DataTable.CellContent>
        ),
        meta: {
          sizeRatio: 100,
        },
      },
    ],
    [
      isCurrentNavigationEntrySelected,
      isRowSelectable,
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
                icon: CATEGORY_DETAILS[category].icon,
                onClick: () => onSelect(category),
              }
            : null
        )
      )
    : [];
}
