import {
  AttachmentIcon,
  Button,
  CloudArrowUpIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
  ScrollBar,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useRef, useState } from "react";

import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { useDebounce } from "@app/hooks/useDebounce";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { getSpaceAccessPriority } from "@app/lib/spaces";
import {
  useSpaces,
  useSpacesSearchWithInfiniteScroll,
} from "@app/lib/swr/spaces";
import type { DataSourceViewContentNode, LightWorkspaceType } from "@app/types";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";

interface InputBarAttachmentsPickerProps {
  owner: LightWorkspaceType;
  fileUploaderService: FileUploaderService;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  isLoading?: boolean;
  attachedNodes: DataSourceViewContentNode[];
}

const PAGE_SIZE = 25;

export const InputBarAttachmentsPicker = ({
  owner,
  fileUploaderService,
  onNodeSelect,
  attachedNodes,
  isLoading = false,
}: InputBarAttachmentsPickerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const {
    inputValue: search,
    debouncedValue: searchQuery,
    isDebouncing,
    setValue: setSearch,
  } = useDebounce("", {
    delay: 300,
    minLength: MIN_SEARCH_QUERY_SIZE,
  });

  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });

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

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  /**
   * Nodes can belong to multiple spaces. This is not of interest to the user,
   * so we pick a space according to a priority order.
   */
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

  const searchbarRef = (element: HTMLInputElement) => {
    if (element) {
      element.focus();
    }
  };

  const showLoader = isSearchLoading || isSearchValidating || isDebouncing;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
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
        className="w-100"
        side="bottom"
        onInteractOutside={() => setIsOpen(false)}
      >
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
        <DropdownMenuItem
          key="upload-item"
          label="Upload file"
          icon={CloudArrowUpIcon}
          onClick={() => fileInputRef.current?.click()}
        />
        <DropdownMenuSeparator />
        <DropdownMenuSearchbar
          ref={searchbarRef}
          name="search-files"
          placeholder="Search knowledge"
          value={search}
          onChange={setSearch}
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const firstMenuItem =
                itemsContainerRef.current?.querySelector('[role="menuitem"]');
              (firstMenuItem as HTMLElement)?.focus();
            }
          }}
        />
        {searchQuery && (
          <>
            <DropdownMenuSeparator />
            <ScrollArea className="flex max-h-96 flex-col" hideScrollBar>
              <div ref={itemsContainerRef}>
                {pickedSpaceNodes.map((item, index) => (
                  <DropdownMenuItem
                    key={index}
                    label={item.title}
                    icon={() =>
                      getVisualForDataSourceViewContentNode(item)({
                        className: "min-w-4",
                      })
                    }
                    extraIcon={
                      isWebsite(item.dataSourceView.dataSource) ||
                      isFolder(item.dataSourceView.dataSource)
                        ? undefined
                        : getConnectorProviderLogoWithFallback({
                            provider:
                              item.dataSourceView.dataSource.connectorProvider,
                          })
                    }
                    disabled={attachedNodes.some(
                      (attachedNode) =>
                        attachedNode.internalId === item.internalId &&
                        attachedNode.dataSourceView.dataSource.sId ===
                          item.dataSourceView.dataSource.sId
                    )}
                    description={`${getLocationForDataSourceViewContentNode(item)}`}
                    onClick={() => {
                      setSearch("");
                      onNodeSelect(item);
                      setIsOpen(false);
                    }}
                  />
                ))}
                {pickedSpaceNodes.length === 0 && !showLoader && (
                  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    No results found
                  </div>
                )}
              </div>
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
              <ScrollBar className="py-0" />
            </ScrollArea>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
