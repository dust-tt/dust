import {
  displayRoleCapitalized,
  getRoleDescription,
} from "@app/components/members/Roles";
import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { GroupSelector } from "@app/components/pages/workspace/governance/GroupSelector";
import { useUpdateGroupGrantedRole } from "@app/lib/swr/groups";
import type { GroupGrantableRole, GroupType } from "@app/types/groups";
import { GROUP_GRANTABLE_ROLES } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { ShieldTick } from "@dust-tt/sparkle";

// One row per grantable role (admin, manager). Each row maps groups to that
// role: adding a group to it grants the role to the group's members; removing
// it clears the mapping. A group can grant at most one role, so a group already
// mapped to a role is not selectable in the other role's row.
function RoleProvisioningRow({
  owner,
  role,
  groups,
}: {
  owner: LightWorkspaceType;
  role: GroupGrantableRole;
  groups: GroupType[];
}) {
  const { doUpdateGroupGrantedRole, isUpdating } = useUpdateGroupGrantedRole({
    owner,
  });

  const selectedGroups = groups.filter((g) => g.grantedRole === role);
  // Only groups that grant no role yet can be added; a group already granting
  // the other role must be cleared there first.
  const selectableGroups = groups.filter((g) => g.grantedRole === null);

  const handleSelectionChange = async (nextGroupIds: string[]) => {
    const currentIds = new Set(selectedGroups.map((g) => g.sId));
    const nextIds = new Set(nextGroupIds);
    const groupById = new Map(groups.map((g) => [g.sId, g]));

    // Newly selected groups get this row's role; removed ones have it cleared.
    const updates: {
      groupId: string;
      grantedRole: GroupGrantableRole | null;
    }[] = [
      ...nextGroupIds
        .filter((id) => !currentIds.has(id))
        .map((groupId) => ({ groupId, grantedRole: role })),
      ...[...currentIds]
        .filter((id) => !nextIds.has(id))
        .map((groupId) => ({ groupId, grantedRole: null })),
    ];

    await Promise.all(
      updates.map(({ groupId, grantedRole }) => {
        const group = groupById.get(groupId);
        if (!group) {
          return undefined;
        }
        return doUpdateGroupGrantedRole({
          groupId,
          groupName: group.name,
          grantedRole,
        });
      })
    );
  };

  return (
    <GovernanceSettingRowLayout
      label={displayRoleCapitalized(role)}
      description={getRoleDescription(role)}
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

export function RoleProvisioningSection({
  owner,
  groups,
}: {
  owner: LightWorkspaceType;
  groups: GroupType[];
}) {
  return (
    <GovernanceSettingSection label="Roles" icon={ShieldTick}>
      {GROUP_GRANTABLE_ROLES.map((role) => (
        <RoleProvisioningRow
          key={role}
          owner={owner}
          role={role}
          groups={groups}
        />
      ))}
    </GovernanceSettingSection>
  );
}
