import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { getGovernancePermissionMetadata } from "@app/components/pages/workspace/governance/capabilityMetadata";
import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import type { GovernancePermissionsByKey } from "@app/types/api/governance";
import type { GroupType } from "@app/types/groups";

export function newManagersOutsideGroup({
  initialManagers,
  selectedManagers,
  initialMembers,
  selectedMemberIds,
}: {
  initialManagers: SearchMemberType[];
  selectedManagers: SearchMemberType[];
  initialMembers: SearchMemberType[];
  selectedMemberIds: Set<string>;
}): SearchMemberType[] {
  const initialManagerIds = new Set(
    initialManagers.map((manager) => manager.sId)
  );
  const initialMemberIds = new Set(initialMembers.map((member) => member.sId));

  return selectedManagers.filter(
    (manager) =>
      !initialManagerIds.has(manager.sId) &&
      (!initialMemberIds.has(manager.sId) ||
        !selectedMemberIds.has(manager.sId))
  );
}

export function GroupManagerAppointmentWarning({
  group,
  managers,
  governancePermissions,
}: {
  group: GroupType;
  managers: SearchMemberType[];
  governancePermissions: GovernancePermissionsByKey;
}) {
  const names = managers.map((manager) => manager.fullName).join(", ");
  const grants: string[] = [];
  if (group.grantedRole === "manager") {
    grants.push("Workspace manager role");
  }
  for (const permission of Object.values(governancePermissions)) {
    if (
      permission?.configuration.scope === "groups" &&
      permission.configuration.groupIds.includes(group.sId)
    ) {
      const label = getGovernancePermissionMetadata(permission)?.label;
      if (label) {
        grants.push(label);
      }
    }
  }
  if (group.grantedSeatType) {
    grants.push(`${seatTypeDisplayName(group.grantedSeatType)} seat`);
  }

  return (
    <div className="flex flex-col gap-3">
      <p>
        {names} {managers.length === 1 ? "is" : "are"} not currently a member of{" "}
        {group.name}. As group managers, they can add themselves or others. That
        gives those people access to resources shared with this group.
      </p>
      {grants.length > 0 ? (
        <div>
          <p>This group also grants:</p>
          <ul className="list-disc pl-6">
            {grants.map((grant) => (
              <li key={grant}>{grant}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p>
          This group has no additional role, permission, or seat configured.
        </p>
      )}
      <p>
        Appoint {managers.length === 1 ? "this person" : "these people"} only if
        you trust them to receive and grant this access. Removing their manager
        role later will not undo access they have already granted.
      </p>
    </div>
  );
}
