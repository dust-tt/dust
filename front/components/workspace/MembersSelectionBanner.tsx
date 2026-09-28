import { BulkSelectionBar } from "@app/components/shared/BulkSelectionBar";
import { SelectedMembersAvatarStack } from "@app/components/workspace/SelectedMembersAvatarStack";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { Button } from "@dust-tt/sparkle";

interface MembersSelectionBannerProps {
  selectedCount: number;
  selectedMembers: MemberUsageType[];
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
  selectedMembers,
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
      selectionPreview={
        selectedMembers.length > 0 && (
          <SelectedMembersAvatarStack
            selectedMembers={selectedMembers}
            size="xs"
          />
        )
      }
    >
      {onBatchChangeSeat && (
        <Button
          size="sm"
          variant="primary"
          label="Change seat"
          onClick={onBatchChangeSeat}
          disabled={disabled}
        />
      )}
      <Button
        size="sm"
        variant="primary"
        label="Edit spend limit"
        onClick={onBatchEditSpendLimit}
        disabled={disabled}
      />
    </BulkSelectionBar>
  );
}
