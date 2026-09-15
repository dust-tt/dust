import { BulkChangeSeatModal } from "@app/components/workspace/BulkChangeSeatModal";
import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
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
import { useState } from "react";

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
  const { doUpdateGroupGrantedSeatType, isUpdating } =
    useUpdateGroupGrantedSeatType({ owner });
  const { doFetchGroupSeatMappingPreview } = useGroupSeatMappingPreview({
    owner,
  });
  // The seat awaiting a cost review before the mapping is applied.
  const [reviewSeat, setReviewSeat] = useState<GroupGrantableSeatType | null>(
    null
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const label = grantedSeatType
    ? seatTypeDisplayName(grantedSeatType)
    : "No seat";

  const handleSelect = async (
    value: GroupGrantableSeatType | typeof NO_SEAT
  ) => {
    // Close the dropdown on selection so it never lingers behind (or after) the
    // review modal.
    setIsMenuOpen(false);
    if (value === NO_SEAT) {
      if (grantedSeatType !== null) {
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
            label="No seat"
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
              label={seatTypeDisplayName(seatType)}
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
          title={`Grant ${seatTypeDisplayName(reviewSeat)} to ${groupName}`}
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
