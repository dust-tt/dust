import { BulkSelectionBar } from "@app/components/shared/BulkSelectionBar";
import { Button } from "@dust-tt/sparkle";

interface MembersSelectionBannerProps {
  selectedCount: number;
  totalCount: number;
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
  totalCount,
  hasMorePagesToSelect,
  onSelectAllAcrossPages,
  onClear,
  onBatchEditSpendLimit,
  onBatchChangeSeat,
  disabled = false,
}: MembersSelectionBannerProps) {
  return (
    <BulkSelectionBar
      selectedCount={selectedCount}
      totalCount={totalCount}
      itemLabel="member"
      canSelectAll={hasMorePagesToSelect}
      onSelectAll={onSelectAllAcrossPages}
      onClear={onClear}
      disabled={disabled}
    >
      {onBatchChangeSeat && (
        <Button
          size="sm"
          variant="primary"
          label="Batch change seat"
          onClick={onBatchChangeSeat}
          disabled={disabled}
        />
      )}
      <Button
        size="sm"
        variant="primary"
        label="Batch edit spend limit"
        onClick={onBatchEditSpendLimit}
        disabled={disabled}
      />
    </BulkSelectionBar>
  );
}
