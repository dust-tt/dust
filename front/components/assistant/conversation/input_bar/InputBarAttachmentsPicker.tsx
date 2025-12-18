import type { DropdownMenuFilterOption } from "@dust-tt/sparkle";
import {
  AttachmentIcon,
  Button,
  CloudArrowUpIcon,
  DoubleIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuFilters,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Input,
  MagnifyingGlassIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { NodePathTooltip } from "@app/components/NodePathTooltip";
import { getIcon } from "@app/components/resources/resources_icons";
import { useDebounce } from "@app/hooks/useDebounce";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useToolFileUpload } from "@app/hooks/useToolFileUpload";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForContentNodeType,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import {
  getDisplayNameForDataSource,
  isFolder,
  isWebsite,
} from "@app/lib/data_sources";
import type {
  ToolSearchResult,
  ToolSearchServerResult,
} from "@app/lib/search/tools/types";
import { getSpaceAccessPriority } from "@app/lib/spaces";
import { useUnifiedSearch } from "@app/lib/swr/search";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  DataSourceType,
  DataSourceViewContentNode,
  LightWorkspaceType,
} from "@app/types";
import {
  asDisplayToolName,
  MIN_SEARCH_QUERY_SIZE,
  removeNulls,
} from "@app/types";

const getKeyForDataSource = (dataSource: DataSourceType) => {
  if (dataSource.connectorProvider === "webcrawler") {
    return `ds-webcrawler`;
  } else if (!dataSource.connectorProvider) {
    return `ds-folder`;
  } else {
    return `ds-${dataSource.sId}`;
  }
};

interface InputBarAttachmentsPickerProps {
  owner: LightWorkspaceType;
  fileUploaderService: FileUploaderService;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  attachedNodes: DataSourceViewContentNode[];
  isLoading?: boolean;
  disabled?: boolean;
  buttonSize?: "xs" | "sm" | "md";
  conversationId?: string | null;
}

const PAGE_SIZE = 25;

interface KnowledgeNodeCheckboxItemProps {
  item: DataSourceViewContentNode;
  owner: LightWorkspaceType;
  attachedNodes: DataSourceViewContentNode[];
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
}

const KnowledgeNodeCheckboxItem = ({
  item,
  owner,
  attachedNodes,
  onNodeSelect,
  onNodeUnselect,
}: KnowledgeNodeCheckboxItemProps) => {
  return (
    <NodePathTooltip node={item} owner={owner}>
      <DropdownMenuCheckboxItem
        label={item.title}
        icon={
          isWebsite(item.dataSourceView.dataSource) ||
          isFolder(item.dataSourceView.dataSource) ? (
            <Icon
              visual={getVisualForDataSourceViewContentNode(item)}
              size="md"
            />
          ) : (
            <DoubleIcon
              size="md"
              mainIcon={getVisualForDataSourceViewContentNode(item)}
              secondaryIcon={getConnectorProviderLogoWithFallback({
                provider: item.dataSourceView.dataSource.connectorProvider,
              })}
            />
          )
        }
        description={getLocationForDataSourceViewContentNode(item)}
        checked={attachedNodes.some(
          (attachedNode) =>
            attachedNode.internalId === item.internalId &&
            attachedNode.dataSourceView.dataSource.sId ===
              item.dataSourceView.dataSource.sId
        )}
        onCheckedChange={(checked) => {
          if (checked) {
            onNodeSelect(item);
          } else {
            onNodeUnselect(item);
          }
        }}
        truncateText
      />
    </NodePathTooltip>
  );
};

interface ToolFileCheckboxItemProps {
  item: ToolSearchResult;
  isLoading: boolean;
  isToolFileAttached: (item: ToolSearchResult) => boolean;
  isToolFileUploading: (item: ToolSearchResult) => boolean;
  uploadToolFile: (item: ToolSearchResult) => void;
  removeToolFile: (item: ToolSearchResult) => void;
}

const ToolFileCheckboxItem = ({
  item,
  isLoading,
  isToolFileAttached,
  isToolFileUploading,
  uploadToolFile,
  removeToolFile,
}: ToolFileCheckboxItemProps) => {
  const isAttached = isToolFileAttached(item);
  const isUploading = isToolFileUploading(item);

  return (
    <DropdownMenuCheckboxItem
      label={item.title}
      icon={
        isUploading ? (
          <Spinner size="sm" />
        ) : (
          <DoubleIcon
            size="md"
            mainIcon={getVisualForContentNodeType(item.type)}
            secondaryIcon={getIcon(item.serverIcon)}
          />
        )
      }
      description={asDisplayToolName(item.serverName)}
      checked={isAttached}
      disabled={isLoading || isUploading}
      onCheckedChange={(checked) => {
        if (checked && !isAttached && !isUploading) {
          void uploadToolFile(item);
        } else if (!checked && isAttached) {
          removeToolFile(item);
        }
      }}
      truncateText
    />
  );
};

export const InputBarAttachmentsPicker = ({
  owner,
  fileUploaderService,
  onNodeSelect,
  onNodeUnselect,
  attachedNodes,
  isLoading = false,
  disabled = false,
  buttonSize = "xs",
  conversationId,
}: InputBarAttachmentsPickerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDataSourcesAndTools, setSelectedDataSourcesAndTools] =
    useState<Record<string, boolean>>({});
  const {
    inputValue: search,
    debouncedValue: searchQuery,
    isDebouncing,
    setValue: setSearch,
  } = useDebounce("", {
    delay: 300,
    minLength: MIN_SEARCH_QUERY_SIZE,
  });

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    disabled: !isOpen,
  });

  const spaceIds = useMemo(() => spaces.map((s) => s.sId), [spaces]);

  const {
    knowledgeResults: searchResultNodes,
    toolResults: toolFileResults,
    isSearchLoading,
    isLoadingNextPage,
    isSearchValidating,
    hasMore,
    nextPage,
  } = useUnifiedSearch({
    owner,
    query: searchQuery,
    pageSize: PAGE_SIZE,
    disabled: isSpacesLoading || !searchQuery,
    spaceIds,
    viewType: "all",
    includeDataSources: true,
    searchSourceUrls: true,
    includeTools: true,
  });

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedDataSourcesAndTools({});
    }
  }, [isOpen, searchQuery]);

  const dataSourcesNodes = useMemo(
    () =>
      removeNulls(
        searchResultNodes.map((node) => {
          const { dataSourceViews, ...rest } = node;
          const dataSourceView = dataSourceViews
            .filter((view) => spacesMap[view.spaceId])
            .map((view) => ({
              ...view,
              spaceName: spacesMap[view.spaceId].name,
              spacePriority: getSpaceAccessPriority(spacesMap[view.spaceId]),
            }))
            .sort(
              (a, b) =>
                b.spacePriority - a.spacePriority ||
                a.spaceName.localeCompare(b.spaceName)
            )[0];

          if (!dataSourceView) {
            return null;
          }

          return {
            ...rest,
            dataSourceView,
          };
        })
      ),
    [searchResultNodes, spacesMap]
  );

  const dataSourcesWithResults: Record<
    string,
    { dataSource: DataSourceType; results: DataSourceViewContentNode[] }
  > = useMemo(() => {
    return dataSourcesNodes.reduce<
      Record<
        string,
        { dataSource: DataSourceType; results: DataSourceViewContentNode[] }
      >
    >((acc, item) => {
      const key = getKeyForDataSource(item.dataSource);
      acc[key] = acc[key] ?? {
        dataSource: item.dataSource,
        results: [],
      };
      acc[key].results.push(item);
      return acc;
    }, {});
  }, [dataSourcesNodes]);

  const serversWithResults = useMemo(
    () =>
      toolFileResults.reduce<
        Record<
          string,
          { server: ToolSearchServerResult; results: ToolSearchResult[] }
        >
      >((acc, item) => {
        acc[`tools-${item.serverName}`] = acc[`tools-${item.serverName}`] ?? {
          server: {
            serverIcon: item.serverIcon,
            serverName: item.serverName,
            serverViewId: item.serverViewId,
          },
          results: [],
        };
        acc[`tools-${item.serverName}`].results.push(item);
        return acc;
      }, {}),
    [toolFileResults]
  );

  // Auto-select new datasources/tools as they appear
  useEffect(() => {
    const allKeys = [
      ...Object.keys(dataSourcesWithResults),
      ...Object.keys(serversWithResults),
    ];
    if (allKeys.length > 0) {
      setSelectedDataSourcesAndTools((prev) => {
        const updated = { ...prev };
        let hasChanges = false;

        allKeys.forEach((key) => {
          if (!(key in updated)) {
            updated[key] = false; // Auto-add as unselected (false = shown when allUnselected)
            hasChanges = true;
          }
        });

        return hasChanges ? updated : prev;
      });
    }
  }, [dataSourcesWithResults, serversWithResults]);

  const handleFilterClick = (key: string) => {
    setSelectedDataSourcesAndTools((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const {
    getToolFileKey,
    isToolFileAttached,
    isToolFileUploading,
    uploadToolFile,
    removeToolFile,
  } = useToolFileUpload({
    owner,
    fileUploaderService,
    conversationId: conversationId ?? undefined,
  });

  const showLoader =
    isSearchLoading || isLoadingNextPage || isSearchValidating || isDebouncing;

  const availableSources: DropdownMenuFilterOption[] = [
    ...Object.entries(dataSourcesWithResults).map(([key, r]) => ({
      value: key,
      label: getDisplayNameForDataSource(r.dataSource, true),
    })),
    ...Object.entries(serversWithResults).map(([key, s]) => ({
      value: key,
      label: asDisplayToolName(s.server.serverName),
    })),
  ];

  const selectedFilterKeys = useMemo(
    () =>
      Object.entries(selectedDataSourcesAndTools)
        .filter(([, value]) => value)
        .map(([key]) => key),
    [selectedDataSourcesAndTools]
  );

  const allUnselected = selectedFilterKeys.length === 0;
  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          setSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          icon={AttachmentIcon}
          size={buttonSize}
          disabled={disabled || isLoading}
          onClick={() => setIsOpen(!isOpen)}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-80 w-80 xs:h-96 xs:w-96"
        collisionPadding={15}
        align="start"
        onInteractOutside={() => setIsOpen(false)}
        onEscapeKeyDown={() => setIsOpen(false)}
        dropdownHeaders={
          <>
            <Input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={async (e) => {
                setIsOpen(false);
                await fileUploaderService.handleFileChange(e);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              multiple={true}
            />
            <DropdownMenuSearchbar
              autoFocus
              name="search-files"
              placeholder="Search"
              value={search}
              onChange={setSearch}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const firstMenuItem =
                    itemsContainerRef.current?.querySelector(
                      '[role="menuitemcheckbox"]'
                    );
                  (firstMenuItem as HTMLElement)?.focus();
                }
              }}
              button={
                <Button
                  icon={CloudArrowUpIcon}
                  label="Upload File"
                  onClick={() => fileInputRef.current?.click()}
                />
              }
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {searchQuery ? (
          <div ref={itemsContainerRef}>
            <div className="flex flex-wrap items-center gap-0.5 p-2">
              {showLoader && (
                <div className="flex h-7 items-center justify-center last:grow">
                  <Spinner size="xs" />
                </div>
              )}
              {availableSources.length > 1 && (
                <DropdownMenuFilters
                  filters={availableSources}
                  selectedValues={selectedFilterKeys}
                  onSelectFilter={handleFilterClick}
                  className="grow"
                />
              )}
            </div>
            {Object.keys(serversWithResults).length === 0 ? (
              // No tools results - show knowledge nodes as returned by the search
              dataSourcesNodes
                .filter(
                  (item) =>
                    allUnselected ||
                    selectedDataSourcesAndTools[
                      getKeyForDataSource(item.dataSource)
                    ]
                )
                .map((item) => (
                  <KnowledgeNodeCheckboxItem
                    key={`knowledge-${item.dataSourceView.dataSource.sId}-${item.internalId}`}
                    item={item}
                    owner={owner}
                    attachedNodes={attachedNodes}
                    onNodeSelect={onNodeSelect}
                    onNodeUnselect={onNodeUnselect}
                  />
                ))
            ) : (
              // Show grouped results - first knowledge nodes, then tools
              <>
                {Object.entries(dataSourcesWithResults).map(([key, r]) => {
                  const isSelected =
                    allUnselected || selectedDataSourcesAndTools[key];
                  return isSelected
                    ? r.results.map((item) => (
                        <KnowledgeNodeCheckboxItem
                          key={`knowledge-${item.dataSourceView.dataSource.sId}-${item.internalId}`}
                          item={item}
                          owner={owner}
                          attachedNodes={attachedNodes}
                          onNodeSelect={onNodeSelect}
                          onNodeUnselect={onNodeUnselect}
                        />
                      ))
                    : null;
                })}
                {Object.entries(serversWithResults).map(([key, r]) => {
                  const isSelected =
                    allUnselected || selectedDataSourcesAndTools[key];
                  return isSelected
                    ? r.results.map((item) => (
                        <ToolFileCheckboxItem
                          key={`tool-${getToolFileKey(item)}`}
                          item={item}
                          isLoading={isLoading}
                          isToolFileAttached={isToolFileAttached}
                          isToolFileUploading={isToolFileUploading}
                          uploadToolFile={uploadToolFile}
                          removeToolFile={removeToolFile}
                        />
                      ))
                    : null;
                })}
              </>
            )}
            {availableSources.length === 0 && !showLoader && (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                No results found
              </div>
            )}

            <InfiniteScroll
              nextPage={nextPage}
              hasMore={hasMore}
              showLoader={showLoader}
              loader={<div />}
            />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center justify-center gap-0 text-center text-base font-semibold text-primary-400">
              <Icon visual={MagnifyingGlassIcon} size="sm" />
              Search knowledge
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
