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
import { MIN_SEARCH_QUERY_SIZE } from "@dust-tt/types";
import { useEffect, useMemo, useRef, useState } from "react";

import type { FileUploaderService } from "@app/hooks/useFileUploaderService";

interface InputBarAttachmentsProps {
  fileUploaderService: FileUploaderService;
  onConnectedFileSelect: (fileId: string) => void;
  isLoading?: boolean;
}

// TODO(attach from input bar): use component with spaces wide search
export const InputBarAttachments = ({
  fileUploaderService,
  onConnectedFileSelect,
  isLoading = false,
}: InputBarAttachmentsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  const items = Array.from({ length: 50 }).map((_, i) => ({
    id: `${i}`,
    title: `Document ${i + 1}`,
    path: "Github",
  }));

  const filteredItems = useMemo(() => {
    return items.filter((item) => item.title.includes(debouncedSearch));
  }, [debouncedSearch, items]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.length >= MIN_SEARCH_QUERY_SIZE ? search : "");
    }, 300);
    return () => {
      clearTimeout(timeout);
    };
  }, [search]);

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          icon={PlusIcon}
          size="xs"
          disabled={isLoading}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[400px]" fullWidth align="start">
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
                className="flex w-fit items-center gap-2 rounded-lg border border-structure-200 px-4 py-2 text-sm hover:bg-structure-50"
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
                open={search.length >= MIN_SEARCH_QUERY_SIZE}
                onOpenChange={() => {}}
                items={filteredItems}
                renderItem={(item, selected) => (
                  <div
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-1 py-2 hover:bg-structure-50",
                      selected && "bg-structure-50"
                    )}
                    onClick={() => {
                      onConnectedFileSelect(item.id);
                      setSearch("");
                    }}
                  >
                    <Icon visual={AttachmentIcon} size="xs" />
                    <span className="text-sm">{item.title}</span>
                    <span className="ml-auto text-sm text-slate-500">
                      {item.path}
                    </span>
                  </div>
                )}
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
