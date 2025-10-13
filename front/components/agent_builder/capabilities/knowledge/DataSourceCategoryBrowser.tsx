import { Spinner } from "@dust-tt/sparkle";
import React, { useCallback, useContext, useMemo } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { DataSourceList } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { ConfirmContext } from "@app/components/Confirm";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { emptyArray } from "@app/lib/swr/swr";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  AgentsUsageType,
  DataSourceViewCategory,
  DataSourceViewCategoryWithoutApps,
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
  const { setCategoryEntry, removeNode } = useDataSourceBuilderContext();

  const confirm = useContext(ConfirmContext);
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const categoryItems = useMemo((): DataSourceListItem[] => {
    if (!isSpaceInfoLoading && spaceInfo) {
      const categoryRows = getCategoryRows(
        spaceInfo.categories,
        hasFeature,
        (category) => {
          if (isDataSourceViewCategoryWithoutApps(category)) {
            setCategoryEntry(category);
          }
        }
      );

      return categoryRows.map((category) => ({
        id: category.id,
        title: category.title,
        icon: category.icon,
        onClick: category.onClick,
        entry: {
          type: "category",
          category: category.id,
        },
      }));
    }
    return emptyArray<DataSourceListItem>();
  }, [hasFeature, isSpaceInfoLoading, setCategoryEntry, spaceInfo]);

  const handleCategorySelectionChange = useCallback(
    async (item: DataSourceListItem, selectionState: boolean | "partial") => {
      // Categories only show checkboxes for partial selections to unselect all
      if (selectionState === "partial") {
        const confirmed = await confirm({
          title: "Are you sure?",
          message: `Do you want to unselect all of "${item.title}"?`,
          validateLabel: "Unselect all",
          validateVariant: "warning",
        });
        if (confirmed) {
          removeNode(item.entry);
        }
      }
    },
    [confirm, removeNode]
  );

  if (isSpaceInfoLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <DataSourceList
      items={categoryItems}
      showCheckboxOnlyForPartialSelection
      onSelectionChange={handleCategorySelectionChange}
    />
  );
}

type SpaceCategory = {
  [p: string]: {
    usage: AgentsUsageType;
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
