import type { WorkspaceType } from "@dust-tt/client";
import {
  Checkbox,
  DataTable,
  Icon,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import React, { useMemo } from "react";

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

import { useDataSourceBuilderContext } from "./DataSourceBuilderContext";

const columns: ColumnDef<CategoryRowData>[] = [
  {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        size="xs"
        checked={
          table.getIsAllRowsSelected()
            ? true
            : table.getIsSomeRowsSelected()
              ? "partial"
              : false
        }
        onClick={(event) => event.stopPropagation()}
        onCheckedChange={(state) => {
          if (state === "indeterminate") {
            return;
          }
          table.toggleAllRowsSelected(state);
        }}
      />
    ),
    cell: ({ row }) => (
      <div className="flex h-full items-center">
        <Checkbox
          size="xs"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(state) => {
            if (state === "indeterminate") {
              return;
            }
            row.toggleSelected(state);
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
];

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
  const { state, dispatch } = useDataSourceBuilderContext();

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

  const rowSelection = useMemo(() => {
    const selectionState: RowSelectionState = {};

    for (const category of categoryRows) {
      selectionState[category.id] =
        ((state.spaces[space.sId] != null &&
          Object.keys(state.spaces[space.sId].nodes).length <= 0) ||
          state.spaces[space.sId].nodes[category.id] != null) &&
        !state.spaces[space.sId].excludedPath.includes(category.id);
    }

    console.log("row state", selectionState);

    return selectionState;
  }, [categoryRows, space.sId, state.spaces]);

  const setRowSelection = (selectionState: RowSelectionState) => {
    console.log("new selection state", selectionState);
    dispatch({
      type: "set-nodes",
      payload: {
        spaceId: space.sId,
        rowSelectionState: selectionState,
      },
    });
  };

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
      enableRowSelection
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
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
