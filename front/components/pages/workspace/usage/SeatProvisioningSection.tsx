import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GroupSelector } from "@app/components/pages/workspace/governance/GroupSelector";
import { BulkChangeSeatModal } from "@app/components/workspace/BulkChangeSeatModal";
import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import {
  useGroupSeatMappingPreview,
  useGroups,
  useUpdateGroupGrantedSeatType,
} from "@app/lib/swr/groups";
import type { GroupGrantableSeatType, GroupType } from "@app/types/groups";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { Page, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";

interface SeatProvisioningRowProps {
  owner: LightWorkspaceType;
  seatType: GroupGrantableSeatType;
  label: string;
  groups: GroupType[];
  seatPlans: SeatPlanResponseBody;
}

// One row per seat type the contract bills. Adding a group to a row grants that
// seat to the group's members; removing it clears the mapping. A group can grant
// at most one seat, so a group already mapped to another seat is not selectable
// here.
function SeatProvisioningRow({
  owner,
  seatType,
  label,
  groups,
  seatPlans,
}: SeatProvisioningRowProps) {
  const { doUpdateGroupGrantedSeatType, isUpdating } =
    useUpdateGroupGrantedSeatType({ owner });
  const { doFetchGroupSeatMappingPreview } = useGroupSeatMappingPreview({
    owner,
  });
  // The group awaiting a review before it is mapped to this seat.
  const [reviewGroup, setReviewGroup] = useState<GroupType | null>(null);

  const selectedGroups = groups.filter((g) => g.grantedSeatType === seatType);
  // Only groups that grant no seat yet can be added; a group already granting
  // another seat must be cleared there first.
  const selectableGroups = groups.filter((g) => g.grantedSeatType === null);

  const handleSelectionChange = async (nextGroupIds: string[]) => {
    const currentIds = new Set(selectedGroups.map((g) => g.sId));
    const nextIds = new Set(nextGroupIds);
    const groupById = new Map(groups.map((g) => [g.sId, g]));

    // Removing a group from the mapping only ever downgrades (deferred), so it
    // applies immediately without a cost review. Apply sequentially to stay clear
    // of `Promise.all` on a dynamically sized array (GroupSelector removes one at
    // a time anyway).
    const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
    for (const groupId of removedIds) {
      const group = groupById.get(groupId);
      if (!group) {
        continue;
      }
      await doUpdateGroupGrantedSeatType({
        groupId,
        groupName: group.name,
        grantedSeatType: null,
      });
    }

    // Adding a group can upgrade many members and cost money, so it goes through
    // the review modal first (GroupSelector adds one group per interaction).
    const addedGroup = nextGroupIds
      .filter((id) => !currentIds.has(id))
      .map((id) => groupById.get(id))
      .find((g): g is GroupType => g !== undefined);
    if (addedGroup) {
      setReviewGroup(addedGroup);
    }
  };

  return (
    <GovernanceSettingRowLayout
      label={label}
      description={`Members of these groups get a ${label} seat.`}
    >
      <GroupSelector
        selectedGroups={selectedGroups}
        selectableGroups={selectableGroups}
        disabled={isUpdating}
        onSelectionChange={(groupIds) => {
          void handleSelectionChange(groupIds);
        }}
      />
      {reviewGroup && (
        <BulkChangeSeatModal
          isOpen
          onClose={() => setReviewGroup(null)}
          title={`Add ${reviewGroup.name} to ${label}`}
          memberCount={reviewGroup.memberCount}
          selectedMembers={[]}
          seatPlans={seatPlans}
          presetSeatType={seatType}
          // The modal is pinned to this row's seat, so the preview always uses
          // the row's granted tier (`seatType`).
          onFetchPreview={() =>
            doFetchGroupSeatMappingPreview({
              groupId: reviewGroup.sId,
              seatType,
            })
          }
          onValidate={async () => {
            const res = await doUpdateGroupGrantedSeatType({
              groupId: reviewGroup.sId,
              groupName: reviewGroup.name,
              grantedSeatType: seatType,
            });
            return res !== null;
          }}
        />
      )}
    </GovernanceSettingRowLayout>
  );
}

interface SeatProvisioningSectionProps {
  owner: LightWorkspaceType;
  // The seat tiers the workspace contract bills, already ordered. Only these are
  // offered as mapping targets.
  availableSeatTypes: GroupGrantableSeatType[];
  seatPlans: SeatPlanResponseBody;
}

export function SeatProvisioningSection({
  owner,
  availableSeatTypes,
  seatPlans,
}: SeatProvisioningSectionProps) {
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: [...MANAGEABLE_GROUP_KINDS],
  });

  if (availableSeatTypes.length === 0) {
    return null;
  }

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="heading-base text-foreground">Group seats</span>
      <div className="w-full rounded-xl border border-border">
        <div className="divide-y divide-border">
          {isGroupsLoading ? (
            <div className="flex justify-center p-4">
              <Spinner size="sm" />
            </div>
          ) : (
            availableSeatTypes.map((seatType) => (
              <SeatProvisioningRow
                key={seatType}
                owner={owner}
                seatType={seatType}
                label={seatTypeDisplayName(seatType)}
                groups={groups}
                seatPlans={seatPlans}
              />
            ))
          )}
        </div>
      </div>
    </Page.Vertical>
  );
}
