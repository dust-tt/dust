import type { GovernancePermissionsByKey } from "@app/types/api/governance";
import { capabilityKey } from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";
import { ContentMessage } from "@dust-tt/sparkle";

// Making a skill discoverable is useless without also being able to pick its availability: whoever
// can do the former should be able to do the latter. Returns who can make skills discoverable but
// not manage availability, or null when the configuration is consistent.
function getDiscoverabilityWarningSubject(
  governancePermissions: GovernancePermissionsByKey,
  groups: GroupType[]
): string | null {
  const availability =
    governancePermissions[
      capabilityKey({ grantType: "publish", resourceType: "skill" })
    ]?.configuration;
  const discoverability =
    governancePermissions[
      capabilityKey({ grantType: "make_discoverable", resourceType: "skill" })
    ]?.configuration;

  if (!availability || !discoverability) {
    return null;
  }

  // "Everyone" covers any discoverability scope, and admins can always manage availability.
  if (availability.scope === "everyone") {
    return null;
  }
  if (discoverability.scope !== "groups") {
    return discoverability.scope === "everyone" ? "Everyone" : null;
  }

  const availabilityGroupIds = new Set(
    availability.scope === "groups" ? availability.groupIds : []
  );
  const groupsById = new Map(groups.map((g) => [g.sId, g]));
  const missingGroupNames = removeNulls(
    discoverability.groupIds
      .filter((groupId) => !availabilityGroupIds.has(groupId))
      .map((groupId) => groupsById.get(groupId)?.name ?? null)
  );

  if (missingGroupNames.length === 0) {
    return null;
  }

  return `The groups ${missingGroupNames.join(", ")}`;
}

interface SkillDiscoverabilityWarningProps {
  governancePermissions: GovernancePermissionsByKey;
  groups: GroupType[];
}

export const SkillDiscoverabilityWarning = ({
  governancePermissions,
  groups,
}: SkillDiscoverabilityWarningProps) => {
  const subject = getDiscoverabilityWarningSubject(
    governancePermissions,
    groups
  );

  if (!subject) {
    return null;
  }

  return (
    <div className="w-full p-4">
      <ContentMessage variant="golden" size="lg">
        {subject} can make skills discoverable, but only people who can manage
        skill availability can act on it. Consider granting them "Manage skill
        availability" to make this permission usable.
      </ContentMessage>
    </div>
  );
};
