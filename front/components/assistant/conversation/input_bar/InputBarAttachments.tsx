import {
  AttachmentIcon,
  Button,
  cn,
  Icon,
  PlusIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchInputWithPopover,
  Separator,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewContentNode,
  LightWorkspaceType,
} from "@dust-tt/types";
import { MIN_SEARCH_QUERY_SIZE } from "@dust-tt/types";
import { useEffect, useMemo, useRef, useState } from "react";

import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { useSpaces, useSpacesSearch } from "@app/lib/swr/spaces";

interface InputBarAttachmentsProps {
  owner: LightWorkspaceType;
  fileUploaderService: FileUploaderService;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  isLoading?: boolean;
}

export const InputBarAttachments = ({
  owner,
  fileUploaderService,
  onNodeSelect,
  isLoading = false,
}: InputBarAttachmentsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [isDebouncing, setIsDebouncing] = useState(false);

  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });
  const { searchResultNodes, isSearchLoading } = useSpacesSearch({
    includeDataSources: true,
    owner,
    search: debouncedSearch,
    viewType: "all",
    disabled: isSpacesLoading,
    spaceIds: spaces.map((s) => s.sId),
  });

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

  const unfoldedNodes: DataSourceViewContentNode[] = useMemo(
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

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button
          variant="ghost-secondary"
          icon={PlusIcon}
          size="xs"
          disabled={isLoading}
        />
      </PopoverTrigger>
      <PopoverContent className="w-125" fullWidth align="start" side="left">
        <div className="flex flex-col gap-4">
          <div className="px-4 pt-4">
            <h2 className="text-lg font-semibold">Local file</h2>
            <div className="mt-2">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={async (e) => {
                  await fileUploaderService.handleFileChange(e);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                multiple={true}
              />
              <button
                className="flex w-fit items-center gap-2 rounded-lg border border-structure-200 px-4 py-2 text-sm text-primary-800 hover:bg-structure-50"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <Icon
                  visual={AttachmentIcon}
                  size="xs"
                  className="text-element-600"
                />
                Attach local file
              </button>
            </div>
          </div>
          <Separator />
          <div className="px-4 pb-2">
            <h2 className="text-lg font-semibold">From knowledge</h2>
            <div className="mt-2">
              <SearchInputWithPopover
                name="search-files"
                placeholder="Search connected files"
                value={search}
                onChange={setSearch}
                isLoading={isSearchLoading || isDebouncing}
                open={search.length >= MIN_SEARCH_QUERY_SIZE}
                onOpenChange={() => {}}
                items={unfoldedNodes}
                renderItem={(item, selected) => {
                  return (
                    <div
                      className={cn(
                        "m-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-structure-50 dark:hover:bg-structure-50-night",
                        selected && "bg-structure-50 dark:bg-structure-50-night"
                      )}
                      onClick={() => {
                        setSearch("");
                        onNodeSelect(item);
                      }}
                    >
                      {getVisualForDataSourceViewContentNode(item)({
                        className: "min-w-4",
                      })}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm">{item.title}</span>
                          <div className="flex-none text-sm text-slate-500">
                            {spacesMap[item.dataSourceView.spaceId]}
                          </div>
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {getLocationForDataSourceViewContentNode(item)}
                        </div>
                      </div>
                    </div>
                  );
                }}
                noResults="No results found"
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
};
