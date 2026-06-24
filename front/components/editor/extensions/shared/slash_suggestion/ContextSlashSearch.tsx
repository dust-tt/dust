import {
  type ContextFileSlashSearchItem,
  type ContextFileSlashSearchSelection,
  useContextFileSlashSearchItems,
} from "@app/components/editor/extensions/shared/slash_suggestion/ContextFileSlashSearch";
import { InlineSlashSearch } from "@app/components/editor/extensions/shared/slash_suggestion/InlineSlashSearch";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import {
  getLocationForDataSourceViewContentNodeWithSpace,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { useUnifiedSearch } from "@app/lib/swr/search";
import { useSpaces } from "@app/lib/swr/spaces";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { DoubleIcon, DropdownMenuItem, Icon, Spinner } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

export type ContextSlashSearchSelection =
  | {
      kind: "file";
      selection: ContextFileSlashSearchSelection;
    }
  | {
      kind: "knowledge";
      node: DataSourceViewContentNode;
    };

type ContextSlashSearchItem =
  | {
      description: string;
      id: string;
      kind: "file";
      label: string;
      selection: ContextFileSlashSearchSelection;
    }
  | {
      description: string;
      id: string;
      kind: "knowledge";
      label: string;
      node: DataSourceViewContentNode;
    };

function contextFileItemToSearchItem(
  item: ContextFileSlashSearchItem
): ContextSlashSearchItem {
  return {
    description: item.description,
    id: item.id,
    kind: "file",
    label: item.label,
    selection: {
      contentType: item.file.contentType,
      fileId: item.fileId,
      label: item.label,
      path: item.path,
    },
  };
}

export type ContextSlashSearchUseCase = "conversation-input" | "skill-builder";

const CONTEXT_SLASH_SEARCH_USE_CASES = {
  "conversation-input": {
    excludeNonRemoteDatabaseTables: false,
    includeDataSources: true,
  },
  "skill-builder": {
    excludeNonRemoteDatabaseTables: true,
    includeDataSources: false,
  },
} as const;

export interface ContextSlashSearchProps {
  conversationId?: string | null;
  isNodeAttached?: (node: DataSourceViewContentNode) => boolean;
  onCancel: () => void;
  onSelect: (selection: ContextSlashSearchSelection) => void;
  owner: LightWorkspaceType;
  useCase: ContextSlashSearchUseCase;
  spaceId?: string | null;
}

export function ContextSlashSearch({
  conversationId = null,
  isNodeAttached,
  onCancel,
  onSelect,
  owner,
  useCase,
  spaceId = null,
}: ContextSlashSearchProps) {
  const { excludeNonRemoteDatabaseTables, includeDataSources } =
    CONTEXT_SLASH_SEARCH_USE_CASES[useCase];
  const includeFiles =
    useCase === "conversation-input" &&
    (Boolean(conversationId) || Boolean(spaceId));
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

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const shouldSearchKnowledge = normalizedQuery.length >= MIN_SEARCH_QUERY_SIZE;

  const { fileItems, isFileItemsLoading } = useContextFileSlashSearchItems({
    conversationId,
    includeFiles,
    normalizedQuery,
    owner,
    spaceId,
  });

  const { knowledgeResults: searchResults, isSearchLoading } = useUnifiedSearch(
    {
      owner,
      query: searchQuery,
      pageSize: 10,
      disabled: isSpacesLoading || !shouldSearchKnowledge,
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

  const knowledgeItems = useMemo(
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

          return {
            description: getLocationForDataSourceViewContentNodeWithSpace(
              knowledgeNode,
              spacesMap
            ),
            id: `knowledge-${node.internalId}-${dataSourceView.sId}`,
            kind: "knowledge" as const,
            label: node.title,
            node: knowledgeNode,
          };
        })
      ),
    [isNodeAttached, searchResults, spacesMap]
  );

  const items = useMemo<ContextSlashSearchItem[]>(
    () => [...fileItems.map(contextFileItemToSearchItem), ...knowledgeItems],
    [fileItems, knowledgeItems]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: items.length and normalizedQuery are intentional triggers
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length, normalizedQuery]);

  const handleItemSelect = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) {
        return;
      }

      if (item.kind === "file") {
        onSelect({ kind: "file", selection: item.selection });
      } else {
        onSelect({ kind: "knowledge", node: item.node });
      }

      setSelectedIndex(0);
      setSearchQuery("");
    },
    [items, onSelect]
  );

  const isLoading =
    isSpacesLoading ||
    isFileItemsLoading ||
    (shouldSearchKnowledge && isSearchLoading);

  const isDropdownOpen =
    searchQuery.trim().length > 0 || items.length > 0 || isLoading;

  const emptyMessage = !shouldSearchKnowledge
    ? "Type at least 2 characters to search"
    : "No results found";

  const loadingMessage = includeFiles
    ? "Searching..."
    : "Searching knowledge...";

  const dropdownContent =
    isLoading && items.length === 0 ? (
      <div className="flex h-14 items-center justify-center">
        <Spinner size="sm" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-500-night">
          {loadingMessage}
        </span>
      </div>
    ) : items.length === 0 ? (
      <div className="flex h-14 items-center justify-center text-center text-sm text-gray-500 dark:text-gray-500-night">
        {!shouldSearchKnowledge && includeFiles && fileItems.length === 0
          ? "No files found"
          : emptyMessage}
      </div>
    ) : (
      items.map((item, index) => (
        <DropdownMenuItem
          key={item.id}
          itemId={item.id}
          icon={
            item.kind === "file" ? (
              <Icon
                visual={getFileTypeIcon(item.selection.contentType, item.label)}
                size="md"
              />
            ) : isWebsite(item.node.dataSourceView.dataSource) ||
              isFolder(item.node.dataSourceView.dataSource) ? (
              <Icon
                visual={getVisualForDataSourceViewContentNode(item.node)}
                size="md"
              />
            ) : (
              <DoubleIcon
                size="md"
                mainIcon={getVisualForDataSourceViewContentNode(item.node)}
                secondaryIcon={getConnectorProviderLogoWithFallback({
                  provider:
                    item.node.dataSourceView.dataSource.connectorProvider,
                })}
              />
            )
          }
          label={item.label}
          description={item.description}
          truncateText
          onClick={() => {
            handleItemSelect(index);
          }}
          onMouseEnter={() => setSelectedIndex(index)}
          className={
            index === selectedIndex ? "bg-gray-100 dark:bg-gray-800" : ""
          }
        />
      ))
    );

  const placeholder = includeFiles
    ? "Search knowledge and files..."
    : "Search for knowledge...";

  return (
    <InlineSlashSearch
      deferDropdownUntilFocus
      dropdownContent={dropdownContent}
      highlightedItemId={items[selectedIndex]?.id}
      isDropdownOpen={isDropdownOpen}
      itemCount={items.length}
      onCancel={onCancel}
      onSearchQueryChange={(text) => {
        setSearchQuery(text);
        setSelectedIndex(0);
      }}
      onSelectIndex={handleItemSelect}
      onSelectedIndexChange={setSelectedIndex}
      placeholder={placeholder}
      searchQuery={searchQuery}
      selectedIndex={selectedIndex}
    />
  );
}
