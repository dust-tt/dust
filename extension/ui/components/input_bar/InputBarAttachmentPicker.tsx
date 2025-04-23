import { getConnectorProviderLogoWithFallback } from "@app/shared/lib/connector_providers";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/shared/lib/content_nodes";
import { getSpaceAccessPriority } from "@app/shared/lib/spaces";
import { useDebounce } from "@app/ui/hooks/useDebounce";
import type { FileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import { useSpaces } from "@app/ui/hooks/useSpaces";
import { useSpacesSearch } from "@app/ui/hooks/useSpacesSearch";
import type {
  DataSourceViewContentNodeType,
  LightWorkspaceType,
} from "@dust-tt/client";
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
  SimpleDoubleIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useRef, useState } from "react";

export const MIN_SEARCH_QUERY_SIZE = 2;

interface InputBarAttachmentsPickerProps {
  owner: LightWorkspaceType;
  fileUploaderService: FileUploaderService;
  onNodeSelect: (node: DataSourceViewContentNodeType) => void;
  isLoading?: boolean;
  attachedNodes: DataSourceViewContentNodeType[];
}

export const InputBarAttachmentsPicker = ({
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

  const { spaces, isSpacesLoading } = useSpaces();
  const { searchResultNodes, isSearchLoading } = useSpacesSearch({
    includeDataSources: true,
    search: searchQuery,
    viewType: "all",
    disabled: isSpacesLoading || !searchQuery,
    spaceIds: spaces.map((s) => s.sId),
  });

  const attachedNodeIds = useMemo(() => {
    return attachedNodes.map((node) => node.internalId);
  }, [attachedNodes]);

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  /**
   * Nodes can belong to multiple spaces. This is not of interest to the user,
   * so we pick a space according to a priority order.
   */
  const pickedSpaceNodes: DataSourceViewContentNodeType[] = useMemo(() => {
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

  const showLoader = isSearchLoading || isDebouncing;

  const searchbarRef = (element: HTMLInputElement) => {
    if (element) {
      element.focus();
    }
  };

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
        className="min-w-64 max-w-96"
        side="bottom"
        align="end"
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
                    icon={
                      <SimpleDoubleIcon
                        mainIcon={getVisualForDataSourceViewContentNode(item)}
                        secondaryIcon={getConnectorProviderLogoWithFallback({
                          provider:
                            item.dataSourceView.dataSource.connectorProvider,
                        })}
                      />
                    }
                    disabled={attachedNodeIds.includes(item.internalId)}
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
                {showLoader && (
                  <div className="flex justify-center py-4">
                    <Spinner variant="dark" size="sm" />
                  </div>
                )}
              </div>
              <ScrollBar className="py-0" />
            </ScrollArea>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
