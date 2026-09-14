import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { GroupSelector } from "@app/components/pages/workspace/governance/GroupSelector";
import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import { useGroups, useUpdateGroupGrantedSeatType } from "@app/lib/swr/groups";
import type { GroupGrantableSeatType, GroupType } from "@app/types/groups";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { LayersThree01, Spinner } from "@dust-tt/sparkle";

interface SeatProvisioningRowProps {
  owner: LightWorkspaceType;
  seatType: GroupGrantableSeatType;
  label: string;
  groups: GroupType[];
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
}: SeatProvisioningRowProps) {
  const { doUpdateGroupGrantedSeatType, isUpdating } =
    useUpdateGroupGrantedSeatType({ owner });

  const selectedGroups = groups.filter((g) => g.grantedSeatType === seatType);
  // Only groups that grant no seat yet can be added; a group already granting
  // another seat must be cleared there first.
  const selectableGroups = groups.filter((g) => g.grantedSeatType === null);

  const handleSelectionChange = async (nextGroupIds: string[]) => {
    const currentIds = new Set(selectedGroups.map((g) => g.sId));
    const nextIds = new Set(nextGroupIds);
    const groupById = new Map(groups.map((g) => [g.sId, g]));

    // Newly selected groups get this row's seat; removed ones have it cleared.
    const updates: {
      groupId: string;
      grantedSeatType: GroupGrantableSeatType | null;
    }[] = [
      ...nextGroupIds
        .filter((id) => !currentIds.has(id))
        .map((groupId) => ({ groupId, grantedSeatType: seatType })),
      ...[...currentIds]
        .filter((id) => !nextIds.has(id))
        .map((groupId) => ({ groupId, grantedSeatType: null })),
    ];

    // Apply sequentially: the selector emits one delta at a time, and a bounded
    // loop keeps us clear of `Promise.all` on a dynamically sized array.
    for (const { groupId, grantedSeatType } of updates) {
      const group = groupById.get(groupId);
      if (!group) {
        continue;
      }
      await doUpdateGroupGrantedSeatType({
        groupId,
        groupName: group.name,
        grantedSeatType,
      });
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
    </GovernanceSettingRowLayout>
  );
}

interface SeatProvisioningSectionProps {
  owner: LightWorkspaceType;
  // The seat tiers the workspace contract bills, already ordered. Only these are
  // offered as mapping targets.
  availableSeatTypes: GroupGrantableSeatType[];
}

export function SeatProvisioningSection({
  owner,
  availableSeatTypes,
}: SeatProvisioningSectionProps) {
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: [...MANAGEABLE_GROUP_KINDS],
  });

  if (availableSeatTypes.length === 0) {
    return null;
  }

  return (
    <GovernanceSettingSection label="Group seats" icon={LayersThree01}>
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
          />
        ))
      )}
    </GovernanceSettingSection>
  );
}
