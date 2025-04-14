import type {
  ContentNodesViewType,
  DataSourceViewType,
  SpaceType,
} from "@dust-tt/client";
import {
  Breadcrumbs,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  HomeIcon,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import type { ComponentType, Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";

import { DataSourceCategoryBrowser } from "@app/components/data_source_view/DataSourceCategoryBrowser";
import { DataSourceNodeTable } from "@app/components/data_source_view/DataSourceNodeTable";
import { DataSourceSearchTable } from "@app/components/data_source_view/DataSourceSearchTable";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import {
  useSpaceDataSourceViewsWithDetails,
  useSpaces,
} from "@app/lib/swr/spaces";
import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  DataSourceViewSelectionConfigurations,
  LightWorkspaceType,
} from "@app/types";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";

type ButtonBreadcrumbItem = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
};

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
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [traversedNode, setTraversedNode] = useState<
    DataSourceViewContentNode | undefined
  >(undefined);
  const [selectedCategory, setSelectedCategory] =
    useState<DataSourceViewCategoryWithoutApps | null>(null);

  // Add search state
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

  const handleGoToRoot = () => {
    setBreadcrumbItems([rootBreadcrumb]);
    setTraversedNode(undefined);
    setSelectedCategory(null);
    setSearchQuery(""); // Clear search when going to root
  };

  const rootBreadcrumb = {
    icon: HomeIcon,
    onClick: handleGoToRoot,
    label: "Home",
  };

  const [breadcrumbItems, setBreadcrumbItems] = useState<
    ButtonBreadcrumbItem[]
  >([rootBreadcrumb]);

  const handleBreadcrumbClick = (index: number) => {
    // Keep breadcrumbs up to the clicked one and remove the rest
    setBreadcrumbItems(breadcrumbItems.slice(0, index + 1));
  };

  // Filter spaces to only those with data source views
  const filteredSpaces = useMemo(() => {
    const spaceIds = new Set(dataSourceViews.map((dsv) => dsv.spaceId));
    return spaces.filter((s) => spaceIds.has(s.sId));
  }, [spaces, dataSourceViews]);

  useEffect(() => {
    if (filteredSpaces.length > 0 && !selectedSpaceId) {
      const firstKey = Object.keys(selectionConfigurations)[0] ?? null;
      const defaultSpaceId = firstKey
        ? selectionConfigurations[firstKey]?.dataSourceView?.spaceId ?? null
        : null;

      setSelectedSpaceId(defaultSpaceId || filteredSpaces[0].sId);
    }
  }, [filteredSpaces, selectionConfigurations, selectedSpaceId]);

  const selectedSpace = useMemo(() => {
    return filteredSpaces.find((s) => s.sId === selectedSpaceId);
  }, [filteredSpaces, selectedSpaceId]);

  const handleSelectCategory = (
    category: DataSourceViewCategoryWithoutApps
  ) => {
    setSelectedCategory(category);
    updateBreadcrumbs(CATEGORY_DETAILS[category].label, () => {
      setSelectedCategory(category);
    });
  };

  const handleNavigateNode = (node: DataSourceViewContentNode) => {
    setTraversedNode(node);
    updateBreadcrumbs(node.title, () => setTraversedNode(node));
  };

  const updateBreadcrumbs = (label: string, onClick: () => void) => {
    setBreadcrumbItems([
      ...breadcrumbItems,
      {
        label,
        onClick,
      },
    ]);
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
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={selectedSpace?.name || "Select space"}
              variant="outline"
              size="xs"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup
              value={selectedSpaceId || ""}
              onValueChange={(newSpaceId) => {
                setSelectedSpaceId(newSpaceId);
                setBreadcrumbItems([rootBreadcrumb]);
                setTraversedNode(undefined);
                setSelectedCategory(null);
                setSearchQuery(""); // Clear search when changing space
              }}
            >
              {filteredSpaces.map((space) => (
                <DropdownMenuRadioItem
                  key={space.sId}
                  value={space.sId}
                  label={space.name}
                  disabled={!allowedSpaces?.some((s) => s.sId === space.sId)}
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {breadcrumbItems?.length > 0 && (
        <Breadcrumbs
          items={breadcrumbItems.map((item, index) => ({
            ...item,
            onClick: () => {
              handleBreadcrumbClick(index);
              item.onClick();
            },
          }))}
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
              updateBreadcrumbs={updateBreadcrumbs}
              setTraversedNode={setTraversedNode}
              searchQuery={searchQuery}
            />
          ) : (
            <>
              {!selectedCategory && !traversedNode ? (
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
