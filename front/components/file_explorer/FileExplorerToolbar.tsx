import type { ViewMode } from "@app/components/file_explorer/FileExplorerItem";
import type { FileExplorerSortMode } from "@app/components/file_explorer/types";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  ArrowDown,
  ArrowUp,
  Button,
  CheckDone01,
  Clock,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  List,
  SearchInput,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

const SORT_ITEMS: Record<
  FileExplorerSortMode,
  {
    label: MessageDescriptor;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  "last-modified": { label: msg`Last modified`, icon: Clock },
  "name-asc": { label: msg`Name A → Z`, icon: ArrowDown },
  "name-desc": { label: msg`Name Z → A`, icon: ArrowUp },
};

interface ViewToggleProps {
  value: ViewMode;
  onValueChange: (v: ViewMode) => void;
}

function ViewToggle({ value, onValueChange }: ViewToggleProps) {
  const { t } = useLingui();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={value === "grid" ? List : CheckDone01}
          tooltip={t`Layout`}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label={t({ message: "Grid", context: "file explorer layout" })}
          onClick={() => onValueChange("grid")}
        />
        <DropdownMenuItem
          label={t({ message: "List", context: "file explorer layout" })}
          onClick={() => onValueChange("list")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SortDropdownProps {
  value: FileExplorerSortMode;
  onValueChange: (v: FileExplorerSortMode) => void;
}

function SortDropdown({ value, onValueChange }: SortDropdownProps) {
  const { t } = useLingui();
  const isMobile = useIsMobile();
  const current = SORT_ITEMS[value];
  const currentLabel = t(current.label);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={current.icon}
          label={isMobile ? undefined : currentLabel}
          tooltip={currentLabel}
          className="[&>span]:sr-only @xs:[&>span]:not-sr-only"
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
              label={t(item.label)}
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
  const { t } = useLingui();
  return (
    <div className="flex shrink-0 items-center gap-2 @container">
      <SearchInput
        name="file-explorer-search"
        placeholder={t`Search files`}
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
