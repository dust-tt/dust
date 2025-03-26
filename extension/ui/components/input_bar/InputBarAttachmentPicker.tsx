import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/shared/lib/content_nodes";
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
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const { spaces, isSpacesLoading } = useSpaces();
  const { searchResultNodes, isSearchLoading } = useSpacesSearch({
    includeDataSources: true,
    search: debouncedSearch,
    viewType: "all",
    disabled: isSpacesLoading || !debouncedSearch,
    spaceIds: spaces.map((s) => s.sId),
  });

  const atachedNodeIds = useMemo(() => {
    return attachedNodes.map((node) => node.internalId);
  }, [attachedNodes]);

  useEffect(() => {
    setIsDebouncing(true);
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.length >= MIN_SEARCH_QUERY_SIZE ? search : "");
      setIsDebouncing(false);
    }, 300);
    return () => {
      clearTimeout(timeout);
      setIsDebouncing(false);
    };
  }, [search]);

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space.name])),
    [spaces]
  );

  const unfoldedNodes: DataSourceViewContentNodeType[] = useMemo(
    () =>
      searchResultNodes.flatMap((node) => {
        const { dataSourceViews, ...rest } = node;
        return dataSourceViews.map((view) => ({
          ...rest,
          dataSourceView: view,
        }));
      }),
    [searchResultNodes]
  );

  const showSearchResults = search.length >= MIN_SEARCH_QUERY_SIZE;

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
        className="w-125"
        side="bottom"
        onInteractOutside={() => setIsOpen(false)}
      >
        <div className="items-end pb-2">
          <DropdownMenuSearchbar
            ref={searchbarRef}
            name="search-files"
            placeholder="Search knowledge"
            value={search}
            onChange={setSearch}
            disabled={isLoading}
          />
          <DropdownMenuSeparator />
          <ScrollArea className="flex max-h-96 flex-col" hideScrollBar>
            {showSearchResults ? (
              <div className="pt-2">
                {unfoldedNodes.length > 0 ? (
                  unfoldedNodes.map((item, index) => (
                    <DropdownMenuItem
                      key={index}
                      label={item.title}
                      icon={() =>
                        getVisualForDataSourceViewContentNode(item)({
                          className: "min-w-4",
                        })
                      }
                      disabled={
                        atachedNodeIds.includes(item.internalId) ||
                        item.type !== "document"
                      }
                      description={`${spacesMap[item.dataSourceView.spaceId]} - ${getLocationForDataSourceViewContentNode(item)}`}
                      onClick={() => {
                        setSearch("");
                        onNodeSelect(item);
                        setIsOpen(false);
                      }}
                    />
                  ))
                ) : isSearchLoading || isDebouncing ? (
                  <div className="flex justify-center py-4">
                    <Spinner variant="dark" size="sm" />
                  </div>
                ) : (
                  <div className="p-2 text-sm text-gray-500">
                    No results found
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-end gap-4 pr-1">
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
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  icon={CloudArrowUpIcon}
                  label="Upload file"
                />
              </div>
            )}
            <ScrollBar className="py-0" />
          </ScrollArea>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
