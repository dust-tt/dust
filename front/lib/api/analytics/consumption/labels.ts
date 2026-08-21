import type { ConsumptionAttributionDimension } from "@app/lib/api/analytics/consumption/scope";
import { sourceLabelForOrigin } from "@app/lib/api/analytics/source_labels";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import { getUserDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";

/**
 * Resolve display names / labels (and pictureUrl where applicable)
 * for a set of keys for a given dimension.
 *
 * The expected mapping is:
 * - "agent": agent sIds
 * - "user": user sIds
 * - "api_key": raw API key names
 * - "group": group sIds
 * - "model": raw model ids
 * - "tool": MCP server names
 * - "skill": skill sIds
 * - "source": origin slugs
 * - "automation": trigger sIds
 */

export type DimensionLabel = {
  name: string;
  // Only agents and users have one; null for every other dimension.
  pictureUrl: string | null;
  // Agents and skills use this for their description. Automations use it for
  // the name of the agent they run.
  description: string | null;
  // Only agents have model metadata.
  modelId?: string;
  modelDisplayName?: string;
  // Only tools and skills have an icon.
  icon?: string | null;
};

function labelsFromNames(
  names: Map<string, string>
): Map<string, DimensionLabel> {
  return new Map(
    [...names].map(([key, name]) => [
      key,
      { name, pictureUrl: null, description: null },
    ])
  );
}

export async function resolveDimensionLabels(
  auth: Authenticator,
  dimension: ConsumptionAttributionDimension,
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
          const label = labels.get(key);
          return [
            key,
            {
              name: label?.name ?? key,
              pictureUrl: label?.pictureUrl ?? null,
              description: label?.description || null,
              modelId: label?.modelId,
              modelDisplayName: label?.modelDisplayName,
            },
          ];
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
              description: null,
            },
          ];
        })
      );
    }

    case "api_key":
      return labelsFromNames(new Map(keys.map((key) => [key, key])));

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
      const metadata =
        await MCPServerViewResource.resolveDisplayMetadataByNames(auth, keys);
      return new Map(
        keys.map((key) => {
          const tool = metadata.get(key);
          return [
            key,
            {
              name: tool?.name ?? asDisplayToolName(key),
              pictureUrl: null,
              description: null,
              icon: tool?.icon ?? null,
            },
          ];
        })
      );
    }

    case "skill": {
      const skills = await SkillResource.fetchByIds(auth, keys, {
        withInstructions: false,
        withTools: false,
        withFileAttachments: false,
      });
      const skillsById = new Map(skills.map((skill) => [skill.sId, skill]));
      return new Map(
        keys.map((key) => {
          const skill = skillsById.get(key);
          return [
            key,
            {
              name: skill?.name ?? key,
              pictureUrl: null,
              description: skill?.userFacingDescription ?? null,
              icon: skill?.icon ?? null,
            },
          ];
        })
      );
    }

    case "source":
      return labelsFromNames(
        new Map(keys.map((key) => [key, sourceLabelForOrigin(key) ?? key]))
      );

    case "automation": {
      const triggers = await TriggerResource.fetchByIds(auth, keys);
      const triggersById = new Map(
        triggers.map((trigger) => [trigger.sId, trigger])
      );
      const agentIds = [
        ...new Set(triggers.map((trigger) => trigger.agentConfigurationId)),
      ];
      const agentLabels = await resolveAnalyticsAgentLabels(auth, agentIds);

      return new Map(
        keys.map((key) => {
          const trigger = triggersById.get(key);
          return [
            key,
            {
              name: trigger?.name ?? `Deleted automation (${key})`,
              pictureUrl: null,
              description: trigger
                ? (agentLabels.get(trigger.agentConfigurationId)?.name ??
                  trigger.agentConfigurationId)
                : null,
            },
          ];
        })
      );
    }

    default:
      assertNever(dimension);
  }
}

export async function resolveDimensionDisplayNames(
  auth: Authenticator,
  dimension: ConsumptionAttributionDimension,
  groupKeys: string[]
): Promise<Map<string, string>> {
  const labels = await resolveDimensionLabels(auth, dimension, groupKeys);
  return new Map([...labels].map(([key, label]) => [key, label.name]));
}
