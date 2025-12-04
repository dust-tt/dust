import {
  AttachmentIcon,
  Button,
  CloudArrowUpIcon,
  DoubleIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Input,
  MagnifyingGlassIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useRef, useState } from "react";

import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { NodePathTooltip } from "@app/components/NodePathTooltip";
import { getIcon } from "@app/components/resources/resources_icons";
import { useDebounce } from "@app/hooks/useDebounce";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForContentNodeType,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { clientFetch } from "@app/lib/egress/client";
import type { ToolSearchNode } from "@app/lib/search/tools/types";
import { getSpaceAccessPriority } from "@app/lib/spaces";
import { useSearchTools } from "@app/lib/swr/search";
import {
  useSpaces,
  useSpacesSearchWithInfiniteScroll,
} from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { DataSourceViewContentNode, LightWorkspaceType } from "@app/types";
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
}: InputBarAttachmentsPickerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [uploadingToolNodes, setUploadingToolNodes] = useState<Set<string>>(
    new Set()
  );
  const sendNotification = useSendNotification();

  const {
    inputValue: search,
    debouncedValue: searchQuery,
    isDebouncing,
    setValue: setSearch,
  } = useDebounce("", {
    delay: 300,
    minLength: MIN_SEARCH_QUERY_SIZE,
  });

  const isToolNodeAttached = useCallback(
    (node: ToolSearchNode) => {
      return fileUploaderService.fileBlobs.some(
        (blob) => blob.id === `tool-${node.serverViewId}-${node.internalId}`
      );
    },
    [fileUploaderService.fileBlobs]
  );

  const handleToolNodeUpload = useCallback(
    async (node: ToolSearchNode) => {
      const nodeKey = `${node.serverViewId}-${node.internalId}`;

      setUploadingToolNodes((prev) => new Set(prev).add(nodeKey));

      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/search/tools/upload`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              serverViewId: node.serverViewId,
              internalId: node.internalId,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message ?? "Failed to upload file");
        }

        const { file } = await response.json();

        fileUploaderService.addUploadedFile({
          id: `tool-${nodeKey}`,
          fileId: file.sId,
          filename: file.fileName,
          contentType: file.contentType,
          size: file.fileSize,
          sourceUrl: node.sourceUrl ?? undefined,
          nodeAttachmentInfo: {
            label: node.serverName,
            iconName: node.serverIcon,
          },
        });
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to attach file",
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      } finally {
        setUploadingToolNodes((prev) => {
          const next = new Set(prev);
          next.delete(nodeKey);
          return next;
        });
      }
    },
    [owner.sId, fileUploaderService, sendNotification]
  );

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    disabled: !isOpen,
  });

  const {
    searchResultNodes,
    isSearchLoading,
    isSearchValidating,
    hasMore,
    nextPage,
  } = useSpacesSearchWithInfiniteScroll({
    includeDataSources: true,
    owner,
    search: searchQuery,
    viewType: "all",
    pageSize: PAGE_SIZE,
    disabled: isSpacesLoading || !searchQuery,
    spaceIds: spaces.map((s) => s.sId),
    searchSourceUrls: true,
  });

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const hasUniversalSearch = hasFeature("universal_search");

  const {
    searchResults: toolContentNodes,
    isSearchLoading: isToolSearchLoading,
    isSearchValidating: isToolSearchValidating,
  } = useSearchTools({
    owner,
    query: searchQuery,
    pageSize: PAGE_SIZE,
    disabled: !hasUniversalSearch || isSpacesLoading || !searchQuery || !isOpen,
  });

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  const pickedSpaceNodes: DataSourceViewContentNode[] = useMemo(() => {
    return searchResultNodes.map((node) => {
      const { dataSourceViews, ...rest } = node;
      const dataSourceView = dataSourceViews
        .map((view) => ({
          ...view,
          spaceName: spacesMap[view.spaceId]?.name,
          spacePriority: getSpaceAccessPriority(spacesMap[view.spaceId]),
        }))
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
  }, [searchResultNodes, spacesMap]);

  const showLoader =
    isSearchLoading ||
    isSearchValidating ||
    isToolSearchLoading ||
    isToolSearchValidating ||
    isDebouncing;

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
            {pickedSpaceNodes.map((item, index) => (
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
                        visual={getVisualForDataSourceViewContentNode(item)}
                        size="md"
                      />
                    ) : (
                      <DoubleIcon
                        size="md"
                        mainIcon={getVisualForDataSourceViewContentNode(item)}
                        secondaryIcon={getConnectorProviderLogoWithFallback({
                          provider:
                            item.dataSourceView.dataSource.connectorProvider,
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
            ))}
            {toolContentNodes.map((item, index) => {
              const nodeKey = `${item.serverViewId}-${item.internalId}`;
              const isAttached = isToolNodeAttached(item);
              const isUploading = uploadingToolNodes.has(nodeKey);

              return (
                <DropdownMenuCheckboxItem
                  key={`tool-${nodeKey}-${index}`}
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
                      void handleToolNodeUpload(item);
                    } else if (!checked && isAttached) {
                      fileUploaderService.removeFile(`tool-${nodeKey}`);
                    }
                  }}
                  truncateText
                />
              );
            })}
            {pickedSpaceNodes.length === 0 &&
              toolContentNodes.length === 0 &&
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
