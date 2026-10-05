import { BulkSelectionBar } from "@app/components/shared/BulkSelectionBar";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { Button } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  return (
    <BulkSelectionBar
      selectedCount={selectedCount}
      totalCount={totalCount}
      itemLabel="member"
      canSelectAll={hasMorePagesToSelect}
      onSelectAll={onSelectAllAcrossPages}
      onClear={onClear}
      disabled={disabled}
      selectedAvatars={selectedMembers.map((member) => ({
        name: member.name,
        visual: member.image ?? undefined,
        isRounded: true,
      }))}
    >
      {onBatchChangeSeat && (
        <Button
          size="sm"
          variant="primary"
          label={t`Change seat`}
          onClick={onBatchChangeSeat}
          disabled={disabled}
        />
      )}
      <Button
        size="sm"
        variant="primary"
        label={t`Edit spend limit`}
        onClick={onBatchEditSpendLimit}
        disabled={disabled}
      />
    </BulkSelectionBar>
  );
}
