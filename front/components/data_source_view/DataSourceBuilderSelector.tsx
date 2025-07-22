import type { BreadcrumbItem } from "@dust-tt/sparkle";
import { Breadcrumbs, SearchInput, Spinner } from "@dust-tt/sparkle";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";

import { DataSourceCategoryBrowser } from "@app/components/data_source_view/DataSourceCategoryBrowser";
import { DataSourceNodeTable } from "@app/components/data_source_view/DataSourceNodeTable";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import {
  useSpaceDataSourceViewsWithDetails,
  useSpaces,
} from "@app/lib/swr/spaces";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  SpaceType,
} from "@app/types";
import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  DataSourceViewSelectionConfigurations,
  LightWorkspaceType,
} from "@app/types";

import type { NavigationHistoryEntryType } from "./DataSourceBuilderContext";
import {
  DataSourceBuilderProvider,
  useDataSourceBuilderContext,
} from "./DataSourceBuilderContext";
import { DataSourceSpaceSelector } from "./DataSourceSpaceSelector";

interface DataSourceBuilderSelectorProps {
  allowedSpaces?: SpaceType[];
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
}

// Helper component to wrap with the provider
export const DataSourceBuilderSelector = (
  props: DataSourceBuilderSelectorProps
) => {
  return (
    <DataSourceBuilderProvider>
      <DataSourceBuilderSelectorContent {...props} />
    </DataSourceBuilderProvider>
  );
};

export const DataSourceBuilderSelectorContent = ({
  allowedSpaces,
  dataSourceViews,
  owner,
  viewType,
}: DataSourceBuilderSelectorProps) => {
  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });

  const {
    navigationHistory,
    navigateTo,
    setSpaceEntry,
    setCategoryEntry,
    addNodeEntry,
  } = useDataSourceBuilderContext();
  const currentNavigationEntry =
    navigationHistory[navigationHistory.length - 1];

  const selectedSpaceId =
    findSpaceFromNavigationHistory(navigationHistory)?.sId;
  const selectedCategory = findCategoryFromNavigationHistory(navigationHistory);
  const traversedNode = getLatestNodeFromNavigationHistory(navigationHistory);

  const [searchQuery, setSearchQuery] = useState("");

  // Fetch category data when a category is selected
  const {
    spaceDataSourceViews: categoryDataSourceViews,
    isSpaceDataSourceViewsLoading: isCategoryLoading,
  } = useSpaceDataSourceViewsWithDetails({
    workspaceId: owner.sId,
    spaceId: selectedSpaceId || "",
    category: selectedCategory || "managed",
    disabled: !selectedSpaceId || !selectedCategory,
  });

  const breadcrumbItems: BreadcrumbItem[] = useMemo(
    () =>
      navigationHistory.map((entry, index) => ({
        ...getBreadcrumbConfig(entry),
        href: undefined,
        onClick: () => navigateTo(index),
      })),
    [navigationHistory, navigateTo]
  );

  // Filter spaces to only those with data source views
  const filteredSpaces = useMemo(() => {
    const spaceIds = new Set(dataSourceViews.map((dsv) => dsv.spaceId));
    return spaces.filter((s) => spaceIds.has(s.sId));
  }, [spaces, dataSourceViews]);

  if (isSpacesLoading) {
    return <Spinner />;
  }

  if (filteredSpaces.length === 0) {
    return <div>No spaces with data sources available.</div>;
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {breadcrumbItems.length > 0 && <Breadcrumbs items={breadcrumbItems} />}

        {currentNavigationEntry.type === "root" ? (
          <DataSourceSpaceSelector
            spaces={filteredSpaces}
            allowedSpaces={allowedSpaces}
            onSelectSpace={setSpaceEntry}
          />
        ) : (
          <SearchInput
            name="search"
            placeholder="Search (Name)"
            value={searchQuery}
            onChange={setSearchQuery}
          />
        )}

        {currentNavigationEntry.type === "space" && (
          <DataSourceCategoryBrowser
            owner={owner}
            space={currentNavigationEntry.space}
            onSelectCategory={setCategoryEntry}
          />
        )}

        {(currentNavigationEntry.type === "node" ||
          currentNavigationEntry.type === "category") && (
          <DataSourceNodeTable
            owner={owner}
            viewType={viewType}
            categoryDataSourceViews={categoryDataSourceViews}
            selectedCategory={selectedCategory}
            traversedNode={traversedNode}
            onNavigate={addNodeEntry}
            isCategoryLoading={isCategoryLoading}
          />
        )}
      </div>
      <ContextLog />
    </>
  );
};

function ContextLog() {
  const { nodes } = useDataSourceBuilderContext();

  return <pre>{JSON.stringify(nodes, undefined, 2)}</pre>;
}

function getBreadcrumbConfig(
  entry: NavigationHistoryEntryType
): BreadcrumbItem {
  switch (entry.type) {
    case "root":
      return {
        label: "Knowledge",
      };
    case "space":
      return {
        label: entry.space.name,
      };
    case "category":
      return {
        label: CATEGORY_DETAILS[entry.category].label,
      };
    case "node":
      return {
        label: entry.node.title,
      };
  }
}

function findSpaceFromNavigationHistory(
  navigationHistory: NavigationHistoryEntryType[]
): SpaceType | null {
  const entry = navigationHistory[1];
  if (entry != null && entry.type === "space") {
    return entry.space;
  }

  return null;
}

function findCategoryFromNavigationHistory(
  navigationHistory: NavigationHistoryEntryType[]
): DataSourceViewCategoryWithoutApps | null {
  const entry = navigationHistory[2];
  if (entry != null && entry.type === "category") {
    return entry.category;
  }

  return null;
}

function getLatestNodeFromNavigationHistory(
  navigationHistory: NavigationHistoryEntryType[]
): DataSourceViewContentNode | null {
  const latestEntry = navigationHistory[navigationHistory.length - 1];

  if (latestEntry.type === "node") {
    return latestEntry.node;
  }

  return null;
}
