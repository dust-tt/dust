import type { WorkspaceType } from "@dust-tt/client";
import { DataTable, Icon, Spinner } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useEffect, useMemo, useState } from "react";

import { CATEGORY_DETAILS } from "@app/lib/spaces";
import { useSpaceInfo } from "@app/lib/swr/spaces";
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
  const [categoryRows, setCategoryRows] = useState<CategoryRowData[]>([]);

  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  useEffect(() => {
    if (!isSpaceInfoLoading && spaceInfo) {
      const rows = getCategoryRows(
        spaceInfo.categories,
        hasFeature,
        (category) => {
          if (isDataSourceViewCategoryWithoutApps(category)) {
            onSelectCategory(category);
          }
        }
      );
      setCategoryRows(rows);
    }
  }, [spaceInfo, isSpaceInfoLoading, hasFeature, onSelectCategory]);

  const columns: ColumnDef<CategoryRowData>[] = useMemo(
    () => [
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
    []
  );

  return (
    <div>
      {isSpaceInfoLoading ? (
        <div className="flex justify-center p-4">
          <Spinner size="md" />
        </div>
      ) : (
        <DataTable data={categoryRows} columns={columns} />
      )}
    </div>
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
                title: CATEGORY_DETAILS[category].label,
                icon: <Icon visual={CATEGORY_DETAILS[category].icon} />,
                onClick: () => onSelect(category),
              }
            : null
        )
      )
    : [];
}
