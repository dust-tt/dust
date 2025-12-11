import {
  AttachmentIcon,
  Button,
  CloudArrowUpIcon,
  DoubleIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
  FolderIcon,
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
import { asDisplayToolName, MIN_SEARCH_QUERY_SIZE } from "@app/types";

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
  // Record where key = datasource/tool id, value = true (selected) or false (filtered out)
  const [dataSourcesAndToolsState, setDataSourcesAndToolsState] = useState<
    Record<string, boolean>
  >({});
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
      setDataSourcesAndToolsState({});
    }
  }, [isOpen, searchQuery]);

  const dataSourcesWithResults: Record<
    string,
    { dataSource: DataSourceType; results: DataSourceViewContentNode[] }
  > = useMemo(() => {
    const nodes = searchResultNodes.map((node) => {
      const { dataSourceViews, ...rest } = node;
      const dataSourceView = dataSourceViews
        .map((view) => {
          const space = spacesMap[view.spaceId];
          return {
            ...view,
            spaceName: space?.name ?? "",
            spacePriority: space ? getSpaceAccessPriority(space) : 0,
          };
        })
        .sort(
          (a, b) =>
            b.spacePriority - a.spacePriority ||
            a.spaceName.localeCompare(b.spaceName)
        )[0];
      return {
        ...rest,
        dataSourceView,
      };
    });

    return nodes.reduce<
      Record<
        string,
        { dataSource: DataSourceType; results: DataSourceViewContentNode[] }
      >
    >((acc, item) => {
      acc[`ds-${item.dataSource.sId}`] = acc[`ds-${item.dataSource.sId}`] ?? {
        dataSource: item.dataSource,
        results: [],
      };
      acc[`ds-${item.dataSource.sId}`].results.push(item);
      return acc;
    }, {});
  }, [searchResultNodes, spacesMap]);

  useEffect(() => {
    const dataSources = Object.keys(dataSourcesWithResults);
    if (dataSources.length > 0) {
      setDataSourcesAndToolsState((prev) => {
        const updated = { ...prev };
        // Only add datasources that haven't been seen yet (not in the record)
        dataSources.forEach((ds) => {
          if (!(ds in updated)) {
            updated[ds] = true; // Auto-select new datasources
          }
        });
        return updated;
      });
    }
  }, [dataSourcesWithResults]);

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

  useEffect(() => {
    const tools = Object.keys(serversWithResults);
    if (tools.length > 0) {
      setDataSourcesAndToolsState((prev) => {
        const lastTool = tools[tools.length - 1];
        // Only add if we haven't seen it before
        if (lastTool in prev) {
          return prev;
        }
        return { ...prev, [lastTool]: true }; // Auto-select new tools
      });
    }
  }, [serversWithResults]);

  // Derive selected datasources/tools from state (where value is true)
  const selectedDataSourcesAndTools = useMemo(
    () =>
      Object.entries(dataSourcesAndToolsState)
        .filter(([, isSelected]) => isSelected)
        .map(([key]) => key),
    [dataSourcesAndToolsState]
  );

  const handleTagClick = (key: string) => {
    const allKeys = [
      ...Object.keys(dataSourcesWithResults),
      ...Object.keys(serversWithResults),
    ];
    const selectedCount = selectedDataSourcesAndTools.length;
    const isSelected = dataSourcesAndToolsState[key];

    if (selectedCount === allKeys.length) {
      // All selected: clicking one shows only that one
      setDataSourcesAndToolsState(() => {
        const updated: Record<string, boolean> = {};
        allKeys.forEach((k) => {
          updated[k] = k === key;
        });
        return updated;
      });
    } else if (!isSelected) {
      // Not selected: select it
      setDataSourcesAndToolsState((prev) => ({ ...prev, [key]: true }));
    } else if (selectedCount === 1) {
      // Only one selected: clicking it selects all
      setDataSourcesAndToolsState((prev) => {
        const updated = { ...prev };
        allKeys.forEach((k) => {
          updated[k] = true;
        });
        return updated;
      });
    } else {
      // Multiple selected: clicking one deselects it
      setDataSourcesAndToolsState((prev) => ({ ...prev, [key]: false }));
    }
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
              placeholder="Search knowledge"
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
            <DropdownMenuTagList>
              {Object.entries(dataSourcesWithResults).map(([key, r]) => (
                <DropdownMenuTagItem
                  key={r.dataSource.sId}
                  icon={
                    r.dataSource.connectorProvider
                      ? getConnectorProviderLogoWithFallback({
                          provider: r.dataSource.connectorProvider,
                          fallback: FolderIcon,
                        })
                      : FolderIcon
                  }
                  label={getDisplayNameForDataSource(r.dataSource)}
                  color={
                    selectedDataSourcesAndTools.includes(key)
                      ? "highlight"
                      : "primary"
                  }
                  onClick={() => handleTagClick(key)}
                />
              ))}
              {Object.entries(serversWithResults).map(([key, s]) => (
                <DropdownMenuTagItem
                  key={s.server.serverName}
                  icon={getIcon(s.server.serverIcon)}
                  label={asDisplayToolName(s.server.serverName)}
                  color={
                    selectedDataSourcesAndTools.includes(key)
                      ? "highlight"
                      : "primary"
                  }
                  onClick={() => handleTagClick(key)}
                />
              ))}
            </DropdownMenuTagList>

            {Object.entries(dataSourcesWithResults).map(([key, r]) => {
              const isSelected = selectedDataSourcesAndTools.includes(key);
              return isSelected ? (
                <>
                  <DropdownMenuLabel
                    icon={getConnectorProviderLogoWithFallback({
                      provider: r.dataSource.connectorProvider,
                      fallback: FolderIcon,
                    })}
                    label={getDisplayNameForDataSource(r.dataSource)}
                  />
                  {r.results.map((item, index) => (
                    <NodePathTooltip
                      key={`knowledge-${index}`}
                      node={item}
                      owner={owner}
                    >
                      <DropdownMenuCheckboxItem
                        label={item.title}
                        icon={
                          isWebsite(item.dataSourceView.dataSource) ||
                          isFolder(item.dataSourceView.dataSource) ? (
                            <Icon
                              visual={getVisualForDataSourceViewContentNode(
                                item
                              )}
                              size="md"
                            />
                          ) : (
                            <DoubleIcon
                              size="md"
                              mainIcon={getVisualForDataSourceViewContentNode(
                                item
                              )}
                              secondaryIcon={getConnectorProviderLogoWithFallback(
                                {
                                  provider:
                                    item.dataSourceView.dataSource
                                      .connectorProvider,
                                }
                              )}
                            />
                          )
                        }
                        description={getLocationForDataSourceViewContentNode(
                          item
                        )}
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
                  ))}
                  <DropdownMenuSeparator />
                </>
              ) : null;
            })}
            {Object.entries(serversWithResults).map(([key, r]) => {
              const isSelected = selectedDataSourcesAndTools.includes(key);
              return isSelected ? (
                <>
                  <DropdownMenuLabel
                    icon={getIcon(r.server.serverIcon)}
                    label={asDisplayToolName(r.server.serverName)}
                  />
                  {r.results.map((item, index) => {
                    const isAttached = isToolFileAttached(item);
                    const isUploading = isToolFileUploading(item);

                    return (
                      <DropdownMenuCheckboxItem
                        key={`tool-${getToolFileKey(item)}-${index}`}
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
                  })}
                  <DropdownMenuSeparator />
                </>
              ) : null;
            })}
            {Object.keys(dataSourcesWithResults).length === 0 &&
              Object.keys(serversWithResults).length === 0 &&
              !showLoader && (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                  No results found
                </div>
              )}
            <InfiniteScroll
              nextPage={nextPage}
              hasMore={hasMore}
              showLoader={showLoader}
              loader={
                <div className="flex justify-center py-4">
                  <Spinner variant="dark" size="sm" />
                </div>
              }
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
