import { Button } from "@dust-tt/sparkle";

interface MembersSelectionBannerProps {
  selectedCount: number;
  // Number of rows on the current page.
  pageCount: number;
  // Total rows matching the current filter (across all pages).
  totalCount: number;
  isAllAcrossPagesSelected: boolean;
  hasMorePagesToSelect: boolean;
  onSelectAllAcrossPages: () => void;
  onClear: () => void;
  onBatchEditSpendLimit: () => void;
  disabled?: boolean;
}

function membersLabel(count: number): string {
  return count === 1 ? "member" : "members";
}

export function MembersSelectionBanner({
  selectedCount,
  pageCount,
  totalCount,
  isAllAcrossPagesSelected,
  hasMorePagesToSelect,
  onSelectAllAcrossPages,
  onClear,
  onBatchEditSpendLimit,
  disabled = false,
}: MembersSelectionBannerProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-row items-center justify-between gap-3 rounded-xl bg-info-50 px-4 py-3 dark:bg-info-950">
      <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground dark:text-foreground-night">
        {isAllAcrossPagesSelected ? (
          <span>
            {selectedCount} {membersLabel(selectedCount)} are selected.
          </span>
        ) : hasMorePagesToSelect ? (
          <>
            <span>
              All {pageCount} {membersLabel(pageCount)} on this page are
              selected.
            </span>
            <button
              type="button"
              className="font-medium text-highlight hover:underline"
              onClick={onSelectAllAcrossPages}
            >
              Select all {totalCount} {membersLabel(totalCount)}
            </button>
          </>
        ) : (
          <span>
            {selectedCount} {membersLabel(selectedCount)} selected
          </span>
        )}
      </div>
      <div className="flex flex-shrink-0 flex-row items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          label="Clear"
          onClick={onClear}
          disabled={disabled}
        />
        <Button
          size="sm"
          variant="primary"
          label="Batch edit spend limit"
          onClick={onBatchEditSpendLimit}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
