import type { ViewMode } from "@app/components/file_explorer/FileExplorerItem";
import type { FileExplorerSortMode } from "@app/components/file_explorer/types";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  ActionTimeIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  Button,
  CheckDone01V2,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListIcon,
  SearchInput,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

const SORT_ITEMS: Record<
  FileExplorerSortMode,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "last-modified": { label: "Last modified", icon: ActionTimeIcon },
  "name-asc": { label: "Name A → Z", icon: ArrowDownIcon },
  "name-desc": { label: "Name Z → A", icon: ArrowUpIcon },
};

interface ViewToggleProps {
  value: ViewMode;
  onValueChange: (v: ViewMode) => void;
}

function ViewToggle({ value, onValueChange }: ViewToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={value === "grid" ? ListIcon : CheckDone01V2}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem label="Grid" onClick={() => onValueChange("grid")} />
        <DropdownMenuItem label="List" onClick={() => onValueChange("list")} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SortDropdownProps {
  value: FileExplorerSortMode;
  onValueChange: (v: FileExplorerSortMode) => void;
}

function SortDropdown({ value, onValueChange }: SortDropdownProps) {
  const isMobile = useIsMobile();
  const current = SORT_ITEMS[value];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={current.icon}
          label={isMobile ? undefined : current.label}
          tooltip={isMobile ? current.label : undefined}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {(Object.keys(SORT_ITEMS) as FileExplorerSortMode[]).map((mode) => {
          const item = SORT_ITEMS[mode];
          return (
            <DropdownMenuItem
              key={mode}
              icon={item.icon}
              label={item.label}
              onClick={() => onValueChange(mode)}
            />
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FileExplorerToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  sortMode: FileExplorerSortMode;
  onSortModeChange: (v: FileExplorerSortMode) => void;
  toolbarExtraActions?: ReactNode;
}

export function FileExplorerToolbar({
  searchQuery,
  onSearchQueryChange,
  viewMode,
  onViewModeChange,
  sortMode,
  onSortModeChange,
  toolbarExtraActions,
}: FileExplorerToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <SearchInput
        name="file-explorer-search"
        placeholder="Search files"
        value={searchQuery}
        onChange={onSearchQueryChange}
        className="flex-1"
      />
      <ViewToggle value={viewMode} onValueChange={onViewModeChange} />
      <SortDropdown value={sortMode} onValueChange={onSortModeChange} />
      {toolbarExtraActions}
    </div>
  );
}
