import type { BreadcrumbItem } from "@dust-tt/sparkle";
import { Breadcrumbs, SearchInput, Spinner } from "@dust-tt/sparkle";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";

import { DataSourceCategoryBrowser } from "@app/components/data_source_view/DataSourceCategoryBrowser";
import { DataSourceNodeTable } from "@app/components/data_source_view/DataSourceNodeTable";
import { DataSourceSearchTable } from "@app/components/data_source_view/DataSourceSearchTable";
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
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";

import { DataSourceSpaceSelector } from "./DataSourceSpaceSelector";

type NavigationHistoryEntry =
  | { type: "root" }
  | { type: "space"; space: SpaceType }
  | { type: "category"; category: DataSourceViewCategoryWithoutApps }
  | { type: "node"; node: DataSourceViewContentNode };

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

export const DataSourceBuilderSelector = ({
  allowedSpaces,
  dataSourceViews,
  owner,
  selectionConfigurations,
  setSelectionConfigurations,
  viewType,
}: DataSourceBuilderSelectorProps) => {
  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });

  const [navigationHistory, setNavigationHistory] = useState<
    NavigationHistoryEntry[]
  >([{ type: "root" }]);

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
        onClick: () => setNavigationHistory((prev) => prev.slice(0, index + 1)),
      })),
    [navigationHistory]
  );

  // Filter spaces to only those with data source views
  const filteredSpaces = useMemo(() => {
    const spaceIds = new Set(dataSourceViews.map((dsv) => dsv.spaceId));
    return spaces.filter((s) => spaceIds.has(s.sId));
  }, [spaces, dataSourceViews]);

  const selectedSpace = useMemo(() => {
    return filteredSpaces.find((s) => s.sId === selectedSpaceId);
  }, [filteredSpaces, selectedSpaceId]);

  const handleSelectCategory = (
    category: DataSourceViewCategoryWithoutApps
  ) => {
    setNavigationHistory((prev) => [...prev, { type: "category", category }]);
  };

  const handleNavigateNode = (node: DataSourceViewContentNode) => {
    setNavigationHistory((prev) => [...prev, { type: "node", node }]);
  };

  if (isSpacesLoading) {
    return <Spinner />;
  }

  if (filteredSpaces.length === 0) {
    return <div>No spaces with data sources available.</div>;
  }

  // Determine whether to show search results or node navigation
  const isSearchActive = searchQuery.length >= MIN_SEARCH_QUERY_SIZE;

  return (
    <div className="flex flex-col gap-4">
      {breadcrumbItems?.length > 0 && <Breadcrumbs items={breadcrumbItems} />}

      {!selectedSpace && (
        <DataSourceSpaceSelector
          spaces={filteredSpaces}
          allowedSpaces={allowedSpaces}
          onSelectSpace={(space) => {
            setNavigationHistory((prev) => [...prev, { type: "space", space }]);
          }}
        />
      )}

      {selectedSpace && (
        <>
          <SearchInput
            name="search"
            placeholder="Search (Name)"
            value={searchQuery}
            onChange={setSearchQuery}
          />

          {isSearchActive ? (
            <DataSourceSearchTable
              owner={owner}
              dataSourceViews={dataSourceViews.filter(
                (dsv) => dsv.spaceId === selectedSpace.sId
              )}
              selectionConfigurations={selectionConfigurations}
              setSelectionConfigurations={setSelectionConfigurations}
              viewType={viewType}
              space={selectedSpace}
              onNavigate={(node) => {
                setNavigationHistory((prev) => [
                  ...prev,
                  { type: "node", node },
                ]);
              }}
              searchQuery={searchQuery}
            />
          ) : (
            <>
              {selectedSpace && !selectedCategory && !traversedNode ? (
                <DataSourceCategoryBrowser
                  owner={owner}
                  space={selectedSpace}
                  onSelectCategory={handleSelectCategory}
                />
              ) : (
                <DataSourceNodeTable
                  owner={owner}
                  viewType={viewType}
                  categoryDataSourceViews={categoryDataSourceViews}
                  selectedCategory={selectedCategory || undefined}
                  traversedNode={traversedNode}
                  onNavigate={handleNavigateNode}
                  isCategoryLoading={isCategoryLoading}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

function getBreadcrumbConfig(entry: NavigationHistoryEntry): BreadcrumbItem {
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
  navigationHistory: NavigationHistoryEntry[]
): SpaceType | null {
  for (const entry of navigationHistory) {
    if (entry.type === "space") {
      return entry.space;
    }
  }

  return null;
}

function findCategoryFromNavigationHistory(
  navigationHistory: NavigationHistoryEntry[]
): DataSourceViewCategoryWithoutApps | null {
  for (const entry of navigationHistory) {
    if (entry.type === "category") {
      return entry.category;
    }
  }

  return null;
}

function getLatestNodeFromNavigationHistory(
  navigationHistory: NavigationHistoryEntry[]
): DataSourceViewContentNode | null {
  const latestEntry = navigationHistory[navigationHistory.length - 1];

  if (latestEntry.type === "node") {
    return latestEntry.node;
  }

  return null;
}
