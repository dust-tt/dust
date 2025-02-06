import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  FolderIcon,
  ScrollArea,
  SearchInput,
} from "@dust-tt/sparkle";
import type { DataSourceTag } from "@dust-tt/types";
import { useEffect, useRef, useState } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

export interface TagSearchProps {
  searchInputValue: string;
  setSearchInputValue: (search: string) => void;
  availableTags: DataSourceTag[];
  selectedTags: DataSourceTag[];
  onTagAdd: (tag: DataSourceTag) => void;
  onTagRemove: (tag: DataSourceTag) => void;
  placeholder?: string;
  isLoading: boolean;
}

export const TagSearchInput = ({
  searchInputValue,
  setSearchInputValue,
  availableTags,
  selectedTags,
  onTagAdd,
  onTagRemove,
  isLoading,
  placeholder = "Search tags...",
}: TagSearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Show dropdown when there are available tags.
  useEffect(() => {
    if (availableTags.length > 0) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [availableTags]);

  // @todo handle loading state
  console.log(isLoading);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full" ref={containerRef}>
        <SearchInput
          name="tag-search"
          ref={inputRef}
          value={searchInputValue}
          onChange={(value) => setSearchInputValue(value)}
          onKeyDown={(e) => {
            if (
              (e.key === "Backspace" && !searchInputValue) ||
              e.key === "Escape"
            ) {
              e.preventDefault();
              setShowDropdown(false);
            }
          }}
          placeholder={placeholder}
          className="w-full"
        />

        <DropdownMenu
          open={showDropdown}
          onOpenChange={setShowDropdown}
          modal={false}
        >
          <DropdownMenuTrigger className="absolute h-0 w-0 opacity-0" />
          <DropdownMenuPortal>
            <DropdownMenuContent
              style={{
                width: containerRef.current?.offsetWidth,
                //marginBottom: "4px",
              }}
              align="start"
            >
              <ScrollArea className="h-[250px]">
                {availableTags.length > 0 ? (
                  availableTags.map((tag, i) => (
                    <Button
                      key={`${tag.tag}-${i}`}
                      variant="ghost"
                      label={tag.tag}
                      onClick={() => onTagAdd(tag)}
                      className="w-full justify-start"
                      icon={
                        tag.connectorProvider
                          ? CONNECTOR_CONFIGURATIONS[tag.connectorProvider]
                              .logoComponent
                          : FolderIcon
                      }
                    />
                  ))
                ) : (
                  <div className="dark:text-muted-foreground-night px-2 py-1.5 text-sm text-muted-foreground">
                    No matching tags
                  </div>
                )}
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-2">
        {selectedTags.map((tag, i) => (
          <Button
            key={`${tag.tag}-${i}`}
            label={tag.tag}
            tooltip="Click to remove tag"
            onClick={() => onTagRemove(tag)}
            variant="outline"
            icon={
              tag.connectorProvider
                ? CONNECTOR_CONFIGURATIONS[tag.connectorProvider].logoComponent
                : FolderIcon
            }
          />
        ))}
      </div>
    </div>
  );
};
