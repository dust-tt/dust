import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import {
  listGroupAllowedTierNames,
  listUserAllowedTierNames,
  listWorkspaceMaxAllowedTierName,
} from "@app/lib/model_tiers/allowed_tiers";
import { MODEL_TIER_OVERRIDE_GROUP_KINDS } from "@app/lib/model_tiers/group_kinds";
import type { ModelTierResolutionSource } from "@app/lib/model_tiers/resolve_allowed";
import { resolveAllowedModelTiers } from "@app/lib/model_tiers/resolve_allowed";
import {
  expandTiersUpTo,
  getMaxTierName,
} from "@app/lib/model_tiers/tier_order";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import type { GroupType } from "@app/types/groups";
import type { UserTypeWithWorkspaces } from "@app/types/user";

export type PokeMemberModelTierGroup = {
  group: GroupType;
  // The group's own override, or null when it carries none.
  maxTierName: ModelsTierName | null;
};

export type PokeMemberModelTier = {
  member: UserTypeWithWorkspaces;
  groups: PokeMemberModelTierGroup[];
  maxTierName: ModelsTierName | null;
  source: ModelTierResolutionSource;
  // Groups whose override sets the member's tier; empty unless `source` is "groups".
  sourceGroupIds: string[];
};

export type PokeGetMemberModelTiers = {
  members: PokeMemberModelTier[];
  workspaceMaxTierName: ModelsTierName;
};

/**
 * @cc [owner:avervaet,label:product] member-tier-matches-runtime-resolution
 * Each active member's `maxTierName` and `source` MUST equal what the runtime resolution yields
 * for that member signed in as a user: their user override, else the highest override among
 * their provisioned and manual groups, else the workspace max tier.
 */
export async function getPokeMemberModelTiers(
  auth: Authenticator
): Promise<PokeGetMemberModelTiers> {
  const [
    { members },
    userOverrides,
    groupOverrides,
    workspaceMaxTierName,
    groups,
  ] = await Promise.all([
    getMembers(auth, { activeOnly: true }),
    listUserAllowedTierNames(auth),
    listGroupAllowedTierNames(auth),
    listWorkspaceMaxAllowedTierName(auth),
    GroupResource.listAllWorkspaceGroups(auth, {
      groupKinds: [...MODEL_TIER_OVERRIDE_GROUP_KINDS],
    }),
  ]);

  const groupModelIdsByUserModelId =
    await GroupResource.dangerouslyListGroupModelIdsByUserModelIdInWorkspace({
      workspace: auth.getNonNullableWorkspace(),
      userModelIds: members.map((m) => m.id),
      groupModelIds: groups.map((g) => g.id),
    });

  const userTierByUserId = new Map(
    userOverrides.map((o) => [o.userId, o.maxTierName])
  );
  const groupTierByGroupId = new Map(
    groupOverrides.map((o) => [o.groupId, o.maxTierName])
  );
  const groupByModelId = new Map(groups.map((g) => [g.id, g]));
  const workspaceAllowedTierNames = expandTiersUpTo(workspaceMaxTierName);

  const memberTiers = members.map((member) => {
    const memberGroups = [
      ...(groupModelIdsByUserModelId.get(member.id) ?? []),
    ].flatMap((groupModelId) => {
      const group = groupByModelId.get(groupModelId);
      if (!group) {
        return [];
      }
      return [
        {
          group: group.toJSON(),
          maxTierName: groupTierByGroupId.get(group.sId) ?? null,
        },
      ];
    });
    memberGroups.sort((a, b) => a.group.name.localeCompare(b.group.name));

    const userTierName = userTierByUserId.get(member.sId);
    const { tiers, source } = resolveAllowedModelTiers({
      workspaceAllowedTierNames,
      groupAllowedTierNamesList: memberGroups.flatMap(({ maxTierName }) =>
        maxTierName ? [expandTiersUpTo(maxTierName)] : []
      ),
      userAllowedTierNames: userTierName ? expandTiersUpTo(userTierName) : [],
    });
    const maxTierName = getMaxTierName(tiers);

    return {
      member,
      groups: memberGroups,
      maxTierName,
      source,
      sourceGroupIds:
        source === "groups"
          ? memberGroups
              .filter((g) => g.maxTierName === maxTierName)
              .map((g) => g.group.sId)
          : [],
    };
  });

  return { members: memberTiers, workspaceMaxTierName };
}
