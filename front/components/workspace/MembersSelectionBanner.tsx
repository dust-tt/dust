import { TableSelectionBanner } from "@app/components/shared/TableSelectionBanner";
import { ContentMessageAction } from "@dust-tt/sparkle";

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
  return (
    <TableSelectionBanner
      selectedCount={selectedCount}
      pageCount={pageCount}
      totalCount={totalCount}
      itemLabel="member"
      isAllAcrossPagesSelected={isAllAcrossPagesSelected}
      hasMorePagesToSelect={hasMorePagesToSelect}
      onSelectAllAcrossPages={onSelectAllAcrossPages}
      onClear={onClear}
      disabled={disabled}
    >
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
    </TableSelectionBanner>
  );
}
