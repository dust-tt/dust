import { InlineSlashSearch } from "@app/components/editor/extensions/shared/slash_suggestion/InlineSlashSearch";
import { computeHasChildren } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import {
  getLocationForDataSourceViewContentNodeWithSpace,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { useUnifiedSearch } from "@app/lib/swr/search";
import { useSpaces } from "@app/lib/swr/spaces";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { DoubleIcon, DropdownMenuItem, Icon, Spinner } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface KnowledgeSlashSearchProps {
  excludeNonRemoteDatabaseTables?: boolean;
  includeDataSources?: boolean;
  isNodeAttached?: (node: DataSourceViewContentNode) => boolean;
  onCancel: () => void;
  onSelect: (node: DataSourceViewContentNode) => void;
  owner: LightWorkspaceType;
  spaceId?: string | null;
}

export function KnowledgeSlashSearch({
  excludeNonRemoteDatabaseTables = false,
  includeDataSources = false,
  isNodeAttached,
  onCancel,
  onSelect,
  owner,
  spaceId,
}: KnowledgeSlashSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global", "regular", "project"],
    disabled: false,
  });

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  const spaceIds = useMemo(() => {
    if (spaceId) {
      return spaces
        .filter((space) => space.sId === spaceId || space.kind === "global")
        .map((space) => space.sId);
    }

    return spaces.map((space) => space.sId);
  }, [spaceId, spaces]);

  const projectId =
    spaceId && spacesMap[spaceId]?.kind === "project" ? spaceId : undefined;

  const { knowledgeResults: searchResults, isSearchLoading } = useUnifiedSearch(
    {
      owner,
      query: searchQuery,
      pageSize: 10,
      disabled: isSpacesLoading || searchQuery.length < MIN_SEARCH_QUERY_SIZE,
      spaceIds,
      projectId,
      viewType: "all",
      excludeNonRemoteDatabaseTables,
      includeDataSources,
      searchSourceUrls: true,
      includeTools: false,
      prioritizeSpaceAccess: true,
    }
  );

  const knowledgeNodes = useMemo(
    () =>
      removeNulls(
        searchResults.map((node) => {
          const { dataSourceViews, ...rest } = node;
          const dataSourceView = dataSourceViews.find(
            (view) => spacesMap[view.spaceId]
          );

          if (!dataSourceView) {
            return null;
          }

          const knowledgeNode = { ...rest, dataSourceView };

          if (isNodeAttached?.(knowledgeNode)) {
            return null;
          }

          return knowledgeNode;
        })
      ),
    [isNodeAttached, searchResults, spacesMap]
  );

  useEffect(() => {
    setSelectedIndex(0);
    if (knowledgeNodes.length > 0) {
      setIsOpen(true);
    }
  }, [knowledgeNodes.length]);

  const handleItemSelect = useCallback(
    (index: number) => {
      const node = knowledgeNodes[index];
      if (node) {
        onSelect(node);
        setIsOpen(false);
        setSelectedIndex(0);
        setSearchQuery("");
      }
    },
    [knowledgeNodes, onSelect]
  );

  const dropdownContent = isSearchLoading ? (
    <div className="flex h-14 items-center justify-center">
      <Spinner size="sm" />
      <span className="ml-2 text-sm text-gray-500 dark:text-gray-500-night">
        Searching knowledge...
      </span>
    </div>
  ) : knowledgeNodes.length === 0 ? (
    <div className="flex h-14 items-center justify-center text-center text-sm text-gray-500 dark:text-gray-500-night">
      {searchQuery.length < MIN_SEARCH_QUERY_SIZE
        ? "Type at least 2 characters to search"
        : "No knowledge found"}
    </div>
  ) : (
    knowledgeNodes.map((node, index) => {
      const itemId = `${node.internalId}-${node.dataSourceView.sId}`;

      return (
        <DropdownMenuItem
          key={itemId}
          itemId={itemId}
          icon={
            isWebsite(node.dataSourceView.dataSource) ||
            isFolder(node.dataSourceView.dataSource) ? (
              <Icon
                visual={getVisualForDataSourceViewContentNode(node)}
                size="md"
              />
            ) : (
              <DoubleIcon
                size="md"
                mainIcon={getVisualForDataSourceViewContentNode(node)}
                secondaryIcon={getConnectorProviderLogoWithFallback({
                  provider: node.dataSourceView.dataSource.connectorProvider,
                })}
              />
            )
          }
          label={node.title}
          description={getLocationForDataSourceViewContentNodeWithSpace(
            node,
            spacesMap
          )}
          truncateText
          onClick={() => handleItemSelect(index)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={
            index === selectedIndex ? "bg-gray-100 dark:bg-gray-800" : ""
          }
        />
      );
    })
  );

  return (
    <InlineSlashSearch
      deferDropdownUntilFocus
      dropdownContent={dropdownContent}
      highlightedItemId={
        knowledgeNodes[selectedIndex]
          ? `${knowledgeNodes[selectedIndex].internalId}-${knowledgeNodes[selectedIndex].dataSourceView.sId}`
          : undefined
      }
      isDropdownOpen={isOpen}
      itemCount={knowledgeNodes.length}
      onCancel={onCancel}
      onSearchQueryChange={(text) => {
        setSearchQuery(text);
        setSelectedIndex(0);
        setIsOpen(text.trim().length > 0);
      }}
      onSelectIndex={handleItemSelect}
      onSelectedIndexChange={setSelectedIndex}
      placeholder="Search for knowledge..."
      searchQuery={searchQuery}
      selectedIndex={selectedIndex}
    />
  );
}

export function knowledgeNodeToItem(node: DataSourceViewContentNode) {
  return {
    dataSourceViewId: node.dataSourceView.sId,
    hasChildren: computeHasChildren(node),
    label: node.title,
    node,
    nodeId: node.internalId,
    spaceId: node.dataSourceView.spaceId,
  };
}
