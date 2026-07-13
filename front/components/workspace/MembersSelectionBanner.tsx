import {
  ContentMessageAction,
  ContentMessageInline,
  Hoverable,
} from "@dust-tt/sparkle";

interface MembersSelectionBannerProps {
  selectedCount: number;
  pageCount: number;
  totalCount: number;
  isAllAcrossPagesSelected: boolean;
  hasMorePagesToSelect: boolean;
  onSelectAllAcrossPages: () => void;
  onClear: () => void;
  onBatchEditSpendLimit: () => void;
  // Absent when the workspace has no assignable seat tiers (non seat-based).
  onBatchChangeSeat?: () => void;
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
  onBatchChangeSeat,
  disabled = false,
}: MembersSelectionBannerProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <ContentMessageInline variant="info">
      <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1">
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
            <Hoverable variant="highlight" onClick={onSelectAllAcrossPages}>
              Select all {totalCount} {membersLabel(totalCount)}
            </Hoverable>
          </>
        ) : (
          <span>
            {selectedCount} {membersLabel(selectedCount)} selected
          </span>
        )}
      </div>
      <ContentMessageAction
        variant="ghost"
        label="Clear"
        onClick={onClear}
        disabled={disabled}
      />
      {onBatchChangeSeat && (
        <ContentMessageAction
          variant="primary"
          label="Batch change seat"
          onClick={onBatchChangeSeat}
          disabled={disabled}
        />
      )}
      <ContentMessageAction
        variant="primary"
        label="Batch edit spend limit"
        onClick={onBatchEditSpendLimit}
        disabled={disabled}
      />
    </ContentMessageInline>
  );
}
