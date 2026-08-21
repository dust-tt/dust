import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  ContentMessageAction,
  ContentMessageInline,
  Hoverable,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface TableSelectionBannerProps {
  selectedCount: number;
  pageCount: number;
  totalCount: number;
  itemLabel: string;
  isAllAcrossPagesSelected: boolean;
  hasMorePagesToSelect: boolean;
  onSelectAllAcrossPages: () => void;
  onClear: () => void;
  disabled?: boolean;
  // ContentMessageAction elements, rendered after "Clear".
  children: ReactNode;
}

export function TableSelectionBanner({
  selectedCount,
  pageCount,
  totalCount,
  itemLabel,
  isAllAcrossPagesSelected,
  hasMorePagesToSelect,
  onSelectAllAcrossPages,
  onClear,
  disabled = false,
  children,
}: TableSelectionBannerProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <ContentMessageInline variant="info">
      <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1">
        {isAllAcrossPagesSelected ? (
          <span>
            {selectedCount} {itemLabel}
            {pluralize(selectedCount)} are selected.
          </span>
        ) : hasMorePagesToSelect ? (
          <>
            <span>
              All {pageCount} {itemLabel}
              {pluralize(pageCount)} on this page are selected.
            </span>
            <Hoverable variant="highlight" onClick={onSelectAllAcrossPages}>
              Select all {totalCount} {itemLabel}
              {pluralize(totalCount)}
            </Hoverable>
          </>
        ) : (
          <span>
            {selectedCount} {itemLabel}
            {pluralize(selectedCount)} selected
          </span>
        )}
      </div>
      <ContentMessageAction
        variant="ghost"
        label="Clear"
        onClick={onClear}
        disabled={disabled}
      />
      {children}
    </ContentMessageInline>
  );
}
