import type { ViewMode } from "@app/components/assistant/conversation/files_panel/FileExplorerItem";
import type { FileExplorerSortMode } from "@app/components/assistant/conversation/files_panel/types";
import {
  ActionTimeIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListCheckIcon,
  ListIcon,
  SearchInput,
} from "@dust-tt/sparkle";

const SORT_LABELS: Record<FileExplorerSortMode, string> = {
  "last-modified": "Last modified",
  "last-created": "Last created",
  "name-asc": "Name A → Z",
  "name-desc": "Name Z → A",
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
          icon={value === "grid" ? ListIcon : ListCheckIcon}
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={ActionTimeIcon}
          label={SORT_LABELS[value]}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {(Object.keys(SORT_LABELS) as FileExplorerSortMode[]).map((mode) => (
          <DropdownMenuItem
            key={mode}
            label={SORT_LABELS[mode]}
            onClick={() => onValueChange(mode)}
          />
        ))}
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
}

export function FileExplorerToolbar({
  searchQuery,
  onSearchQueryChange,
  viewMode,
  onViewModeChange,
  sortMode,
  onSortModeChange,
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
    </div>
  );
}
