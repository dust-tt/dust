import { getConnectorProviderLogoWithFallback } from "@app/shared/lib/connector_providers";
import {
  getDisplayNameForDataSource,
  getLocationForDataSourceViewContentNode,
  getVisualForContentNodeType,
  getVisualForDataSourceViewContentNode,
} from "@app/shared/lib/content_nodes";
import { getIcon } from "@app/shared/lib/resources_icons";
import { useDebounce } from "@app/ui/hooks/useDebounce";
import type { FileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import { useSpaces } from "@app/ui/hooks/useSpaces";
import { useToolFileUpload } from "@app/ui/hooks/useToolFileUpload";
import type { ToolSearchResult } from "@app/ui/hooks/useUnifiedSearch";
import type { DataSourceViewContentNode } from "@app/ui/hooks/useUnifiedSearch";
import { useUnifiedSearch } from "@app/ui/hooks/useUnifiedSearch";
import type { DataSourceType, LightWorkspaceType } from "@dust-tt/client";
import { isFolder, isWebsite } from "@dust-tt/client";
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
  ScrollArea,
  ScrollBar,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";
export const MIN_SEARCH_QUERY_SIZE = 2;
const PAGE_SIZE = 25;

const getKeyForDataSource = (dataSource: DataSourceType) => {
  if (dataSource.connectorProvider === "webcrawler") {
    return `ds-webcrawler`;
  } else if (!dataSource.connectorProvider) {
    return `ds-folder`;
  } else {
    return `ds-${dataSource.sId}`;
  }
};

const asDisplayToolName = (serverName: string) => {
  // Here we don't need the complexity of the asDisplayToolName function from the front-end, as we only need that for searchable tools
  return (
    serverName.charAt(0).toUpperCase() + serverName.slice(1).replace(/_/g, " ")
  );
};

export type ToolSearchServerResult = {
  serverViewId: string;
  serverName: string;
  serverIcon: string;
};

interface InputBarAttachmentsPickerProps {
  owner: LightWorkspaceType;
  fileUploaderService: FileUploaderService;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  isLoading?: boolean;
  attachedNodes: DataSourceViewContentNode[];
}

interface KnowledgeNodeCheckboxItemProps {
  item: DataSourceViewContentNode;
  attachedNodes: DataSourceViewContentNode[];
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
}

const KnowledgeNodeCheckboxItem = ({
  item,
  attachedNodes,
  onNodeSelect,
  onNodeUnselect,
}: KnowledgeNodeCheckboxItemProps) => {
  return (
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
  fileUploaderService,
  onNodeSelect,
  onNodeUnselect,
  attachedNodes,
  isLoading = false,
}: InputBarAttachmentsPickerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
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

  const { spaces, isSpacesLoading } = useSpaces();
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
    query: searchQuery,
    pageSize: PAGE_SIZE,
    disabled: isSpacesLoading || !searchQuery,
    spaceIds,
    viewType: "all",
    includeDataSources: true,
    searchSourceUrls: true,
    includeTools: true,
  });

  const {
    getToolFileKey,
    isToolFileAttached,
    isToolFileUploading,
    uploadToolFile,
    removeToolFile,
  } = useToolFileUpload({
    fileUploaderService,
    conversationId: undefined,
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedDataSourcesAndTools({});
    }
  }, [isOpen, searchQuery]);

  const dataSourcesWithResults: Record<
    string,
    { dataSource: DataSourceType; results: DataSourceViewContentNode[] }
  > = useMemo(() => {
    return searchResultNodes.reduce<
      Record<
        string,
        { dataSource: DataSourceType; results: DataSourceViewContentNode[] }
      >
    >((acc, item) => {
      const key = getKeyForDataSource(item.dataSourceView.dataSource);
      acc[key] = acc[key] ?? {
        dataSource: item.dataSourceView.dataSource,
        results: [],
      };
      acc[key].results.push(item);
      return acc;
    }, {});
  }, [searchResultNodes]);

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

  // Infinite scroll handler
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || !hasMore || isLoadingNextPage) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollArea;
      // Trigger next page when scrolled to 80% of the content
      if (scrollTop + clientHeight >= scrollHeight * 0.8) {
        void nextPage();
      }
    };

    scrollArea.addEventListener("scroll", handleScroll);
    return () => scrollArea.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoadingNextPage, nextPage]);

  const handleFilterClick = (key: string) => {
    setSelectedDataSourcesAndTools((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
          size="xs"
          disabled={isLoading}
          onClick={() => setIsOpen(!isOpen)}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="xs:h-96 xs:w-96 h-80 w-80"
        collisionPadding={15}
        align="end"
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
            <ScrollArea
              ref={scrollAreaRef}
              className="flex max-h-96 flex-col"
              hideScrollBar
            >
              {Object.keys(serversWithResults).length === 0 ? (
                // No tools results - show knowledge nodes as returned by the search
                searchResultNodes
                  .filter(
                    (item) =>
                      allUnselected ||
                      selectedDataSourcesAndTools[
                        getKeyForDataSource(item.dataSourceView.dataSource)
                      ]
                  )
                  .map((item) => (
                    <KnowledgeNodeCheckboxItem
                      key={`knowledge-${item.dataSourceView.dataSource.sId}-${item.internalId}`}
                      item={item}
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
                <div className="text-muted-foreground dark:text-muted-foreground-night flex items-center justify-center py-4 text-sm">
                  No results found
                </div>
              )}
              <ScrollBar className="py-0" />
            </ScrollArea>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-primary-400 flex flex-col items-center justify-center gap-0 text-center text-base font-semibold">
              Search knowledge
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
