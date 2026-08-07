import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import { sourceLabelForOrigin } from "@app/lib/api/analytics/source_labels";
import {
  resolveAnalyticsAgentLabels,
  UNKNOWN_AGENT_LABEL,
} from "@app/lib/api/assistant/observability/agent_labels";
import { getUserDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import { resolveServerDisplayNames } from "@app/lib/api/assistant/observability/tool_usage";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Display labels for the keys a breakdown or a ranking produces.
 *
 * The keys come straight out of the index — agent sIds, raw model ids, origin
 * slugs — and mean nothing in a chart legend or a table row. Every dimension
 * resolves its whole key list in one go rather than per key, so a breakdown
 * stays one lookup wide whatever the group count.
 *
 * Keys that cannot be resolved keep their raw value: an agent or a model can
 * leave the workspace while its consumption stays indexed, and a group that
 * disappears is worse than one labelled with an id.
 */

export type ConsumptionGroupLabel = {
  name: string;
  // Only agents and users have one; null for every other dimension.
  pictureUrl: string | null;
  // Only agents have one; null for every other dimension.
  scope: AgentConfigurationScope | null;
  // Only models have one; null for every other dimension.
  modelMaker: ModelMakerIdType | null;
  // Only models have one; null for every other dimension.
  tier: ModelsTierName | null;
};

function labelsFromNames(
  names: Map<string, string>
): Map<string, ConsumptionGroupLabel> {
  return new Map(
    [...names].map(([key, name]) => [
      key,
      { name, pictureUrl: null, scope: null, modelMaker: null, tier: null },
    ])
  );
}

export async function resolveConsumptionGroupLabels(
  auth: Authenticator,
  dimension: ConsumptionScopeDimension,
  groupKeys: string[]
): Promise<Map<string, ConsumptionGroupLabel>> {
  if (groupKeys.length === 0) {
    return new Map();
  }

  switch (dimension) {
    case "agent": {
      const labels = await resolveAnalyticsAgentLabels(auth, groupKeys);
      return new Map(
        groupKeys.map((key) => {
          const label = labels.get(key) ?? UNKNOWN_AGENT_LABEL;
          return [
            key,
            {
              name: label.name,
              pictureUrl: label.pictureUrl,
              scope: label.scope,
              modelMaker: null,
              tier: null,
            },
          ];
        })
      );
    }

    case "user": {
      const users = await UserResource.fetchByIds(groupKeys);
      const usersById = new Map(users.map((user) => [user.sId, user]));
      return new Map(
        groupKeys.map((key) => {
          const user = usersById.get(key);
          return [
            key,
            {
              name: getUserDisplayName(user),
              pictureUrl: user?.imageUrl ?? null,
              scope: null,
              modelMaker: null,
              tier: null,
            },
          ];
        })
      );
    }

    case "model": {
      return new Map(
        groupKeys.map((key) => {
          const config = getModelConfigByModelId(key);
          return [
            key,
            {
              name: config?.displayName ?? key,
              pictureUrl: null,
              scope: null,
              modelMaker: config ? getModelMaker(config) : null,
              tier: config
                ? ModelsTierResource.getTierForModel(
                    config.modelId,
                    config.defaultReasoningEffort
                  )
                : null,
            },
          ];
        })
      );
    }

    case "tool": {
      // The key is the MCP server name. Internal servers get their display name
      // from the name itself; remote ones are keyed by sId and need a lookup.
      const displayNames = await resolveServerDisplayNames(auth, groupKeys);
      return labelsFromNames(
        new Map(groupKeys.map((key) => [key, displayNames.get(key) || key]))
      );
    }

    case "skill": {
      const skills = await SkillResource.fetchByIds(auth, groupKeys);
      const namesById = new Map(skills.map((skill) => [skill.sId, skill.name]));
      return labelsFromNames(
        new Map(groupKeys.map((key) => [key, namesById.get(key) ?? key]))
      );
    }

    case "source":
      return labelsFromNames(
        new Map(groupKeys.map((key) => [key, sourceLabelForOrigin(key) ?? key]))
      );

    default:
      assertNever(dimension);
  }
}

export async function resolveConsumptionGroupNames(
  auth: Authenticator,
  dimension: ConsumptionScopeDimension,
  groupKeys: string[]
): Promise<Map<string, string>> {
  const labels = await resolveConsumptionGroupLabels(
    auth,
    dimension,
    groupKeys
  );
  return new Map([...labels].map(([key, label]) => [key, label.name]));
}
