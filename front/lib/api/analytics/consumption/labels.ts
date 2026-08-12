import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import { sourceLabelForOrigin } from "@app/lib/api/analytics/source_labels";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import { getUserDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import { resolveServerDisplayNames } from "@app/lib/api/assistant/observability/tool_usage";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Resolve display names / labels (and pictureUrl where applicable)
 * for a set of keys for a given dimension.
 *
 * The expected mapping is:
 * - "agent": agent sIds
 * - "user": user sIds
 * - "group": group sIds
 * - "model": raw model ids
 * - "tool": MCP server names
 * - "skill": skill sIds
 * - "source": origin slugs
 */

export type DimensionLabel = {
  name: string;
  // Only agents and users have one; null for every other dimension.
  pictureUrl: string | null;
};

function labelsFromNames(
  names: Map<string, string>
): Map<string, DimensionLabel> {
  return new Map(
    [...names].map(([key, name]) => [key, { name, pictureUrl: null }])
  );
}

export async function resolveDimensionLabels(
  auth: Authenticator,
  dimension: ConsumptionScopeDimension,
  keys: string[]
): Promise<Map<string, DimensionLabel>> {
  if (keys.length === 0) {
    return new Map();
  }

  switch (dimension) {
    case "agent": {
      const labels = await resolveAnalyticsAgentLabels(auth, keys);
      return new Map(
        keys.map((key) => {
          const label = labels.get(key) ?? { name: key, pictureUrl: null };
          return [key, { name: label.name, pictureUrl: label.pictureUrl }];
        })
      );
    }

    case "user": {
      const users = await UserResource.fetchByIds(keys);
      const usersById = new Map(users.map((user) => [user.sId, user]));
      return new Map(
        keys.map((key) => {
          const user = usersById.get(key);
          return [
            key,
            {
              name: getUserDisplayName(user),
              pictureUrl: user?.imageUrl ?? null,
            },
          ];
        })
      );
    }

    case "group": {
      const groups = await GroupResource.listAllWorkspaceGroups(auth, {
        groupKinds: [...CAP_ELIGIBLE_GROUP_KINDS],
      });
      const namesById = new Map(groups.map((group) => [group.sId, group.name]));
      return labelsFromNames(
        new Map(keys.map((key) => [key, namesById.get(key) ?? key]))
      );
    }

    case "model":
      return labelsFromNames(
        new Map(
          keys.map((key) => [
            key,
            getModelConfigByModelId(key)?.displayName ?? key,
          ])
        )
      );

    case "tool": {
      // The key is the MCP server name. Internal servers get their display name
      // from the name itself; remote ones are keyed by sId and need a lookup.
      const displayNames = await resolveServerDisplayNames(auth, keys);
      return labelsFromNames(
        new Map(keys.map((key) => [key, displayNames.get(key) || key]))
      );
    }

    case "skill": {
      const skills = await SkillResource.fetchByIds(auth, keys);
      const namesById = new Map(skills.map((skill) => [skill.sId, skill.name]));
      return labelsFromNames(
        new Map(keys.map((key) => [key, namesById.get(key) ?? key]))
      );
    }

    case "source":
      return labelsFromNames(
        new Map(keys.map((key) => [key, sourceLabelForOrigin(key) ?? key]))
      );

    default:
      assertNever(dimension);
  }
}

export async function resolveDimensionDisplayNames(
  auth: Authenticator,
  dimension: ConsumptionScopeDimension,
  groupKeys: string[]
): Promise<Map<string, string>> {
  const labels = await resolveDimensionLabels(auth, dimension, groupKeys);
  return new Map([...labels].map(([key, label]) => [key, label.name]));
}
