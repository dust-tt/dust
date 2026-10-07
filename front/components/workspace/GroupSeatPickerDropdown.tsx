import { ConfirmContext } from "@app/components/Confirm";
import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import { BulkChangeSeatModal } from "@app/components/workspace/BulkChangeSeatModal";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import {
  useGroupSeatMappingPreview,
  useUpdateGroupGrantedSeatType,
} from "@app/lib/swr/groups";
import type { GroupGrantableSeatType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useContext, useState } from "react";

// The dropdown value used for "grant no seat" (clears the mapping). Distinct from
// the seat types so it round-trips through the checkbox items.
const NO_SEAT = "__none__";

interface GroupSeatPickerDropdownProps {
  owner: LightWorkspaceType;
  groupId: string;
  groupName: string;
  memberCount: number;
  grantedSeatType: GroupGrantableSeatType | null;
  // The seat tiers the contract bills, already ordered. Only these are offered.
  grantableSeatTypes: GroupGrantableSeatType[];
  seatPlans: SeatPlanResponseBody;
}

// Per-group seat picker for the Groups table: selecting a seat grants it to every
// member of the group. Granting/raising a seat can upgrade members and cost
// money, so it goes through the shared review modal first; clearing the mapping
// only downgrades (deferred) and applies immediately.
export function GroupSeatPickerDropdown({
  owner,
  groupId,
  groupName,
  memberCount,
  grantedSeatType,
  grantableSeatTypes,
  seatPlans,
}: GroupSeatPickerDropdownProps) {
  const { t } = useLingui();
  const { doUpdateGroupGrantedSeatType, isUpdating } =
    useUpdateGroupGrantedSeatType({ owner });
  const { doFetchGroupSeatMappingPreview } = useGroupSeatMappingPreview({
    owner,
  });
  const confirm = useContext(ConfirmContext);
  // The seat awaiting a cost review before the mapping is applied.
  const [reviewSeat, setReviewSeat] = useState<GroupGrantableSeatType | null>(
    null
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const label = grantedSeatType
    ? seatTypeDisplayName(grantedSeatType, t)
    : t`No seat`;

  const reviewSeatName = reviewSeat ? seatTypeDisplayName(reviewSeat, t) : null;

  const handleSelect = async (
    value: GroupGrantableSeatType | typeof NO_SEAT
  ) => {
    // Close the dropdown on selection so it never lingers behind (or after) the
    // review/confirmation.
    setIsMenuOpen(false);
    if (value === NO_SEAT) {
      if (grantedSeatType === null) {
        return;
      }
      // Clearing the mapping downgrades members (deferred to period end), so
      // confirm and show how many are affected before applying.
      const seatName = seatTypeDisplayName(grantedSeatType, t);
      const confirmed = await confirm({
        title: t`Remove group seat`,
        message: t`Members of ${groupName} will lose their ${seatName} seat at the end of the current billing period. Members who also get this seat (or a higher one) from another group keep it. This affects up to ${plural(
          memberCount,
          { one: "# member", other: "# members" }
        )}.`,
        validateLabel: t`Remove seat`,
        validateVariant: "warning",
        cancelLabel: t`Cancel`,
      });
      if (confirmed) {
        await doUpdateGroupGrantedSeatType({
          groupId,
          groupName,
          grantedSeatType: null,
        });
      }
      return;
    }
    if (value !== grantedSeatType) {
      setReviewSeat(value);
    }
  };

  return (
    <>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            isSelect
            label={label}
            isLoading={isUpdating}
            disabled={isUpdating}
            className="min-w-40 justify-between"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
          <DropdownMenuCheckboxItem
            label={t`No seat`}
            checked={grantedSeatType === null}
            onCheckedChange={(checked) => {
              if (checked) {
                void handleSelect(NO_SEAT);
              }
            }}
          />
          {grantableSeatTypes.map((seatType) => (
            <DropdownMenuCheckboxItem
              key={seatType}
              label={seatTypeDisplayName(seatType, t)}
              checked={grantedSeatType === seatType}
              onCheckedChange={(checked) => {
                if (checked) {
                  void handleSelect(seatType);
                }
              }}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {reviewSeat && (
        <BulkChangeSeatModal
          isOpen
          onClose={() => setReviewSeat(null)}
          title={t`Grant ${reviewSeatName} to ${groupName}`}
          memberCount={memberCount}
          selectedMembers={[]}
          seatPlans={seatPlans}
          presetSeatType={reviewSeat}
          // The modal is pinned to this row's seat, so the preview always uses
          // the selected granted tier (`reviewSeat`).
          onFetchPreview={() =>
            doFetchGroupSeatMappingPreview({ groupId, seatType: reviewSeat })
          }
          onValidate={async () => {
            const res = await doUpdateGroupGrantedSeatType({
              groupId,
              groupName,
              grantedSeatType: reviewSeat,
            });
            return res !== null;
          }}
        />
      )}
    </>
  );
}
