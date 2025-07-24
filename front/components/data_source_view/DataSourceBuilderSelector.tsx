import type { BreadcrumbItem } from "@dust-tt/sparkle";
import { Breadcrumbs, SearchInput, Spinner } from "@dust-tt/sparkle";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import type { Control } from "react-hook-form";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import {
  DataSourceBuilderProvider,
  useDataSourceBuilderContext,
} from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  findCategoryFromNavigationHistory,
  findSpaceFromNavigationHistory,
  getLatestNodeFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { DataSourceCategoryBrowser } from "@app/components/data_source_view/DataSourceCategoryBrowser";
import { DataSourceNodeTable } from "@app/components/data_source_view/DataSourceNodeTable";
import { DataSourceSpaceSelector } from "@app/components/data_source_view/DataSourceSpaceSelector";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import { useSpaceDataSourceViewsWithDetails } from "@app/lib/swr/spaces";
import type {
  ContentNodesViewType,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

type DataSourceBuilderSelectorProps = {
  allowedSpaces?: SpaceType[];
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
  control: Control<CapabilityFormData>;
};

export const DataSourceBuilderSelector = ({
  control,
  ...props
}: DataSourceBuilderSelectorProps) => {
  const { spaces, isSpacesLoading } = useSpacesContext();

  if (isSpacesLoading) {
    return <Spinner />;
  }

  return (
    <DataSourceBuilderProvider control={control} spaces={spaces}>
      <DataSourceBuilderSelectorContent {...props} />
    </DataSourceBuilderProvider>
  );
};

export const DataSourceBuilderSelectorContent = ({
  allowedSpaces,
  dataSourceViews,
  owner,
  viewType,
}: Omit<DataSourceBuilderSelectorProps, "control">) => {
  const {
    spaces,
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

  if (filteredSpaces.length === 0) {
    return <div>No spaces with data sources available.</div>;
  }

  return (
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
  );
};

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
