import type { ConsumptionTopDimension } from "@app/lib/api/analytics/consumption/scope";
import { sourceLabelForOrigin } from "@app/lib/api/analytics/source_labels";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import { getUserDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { getTierForModel } from "@app/types/assistant/models/model_tiers";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";
import capitalize from "lodash/capitalize";

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
 * - "conversation": conversation sIds
 * - "tag": agent tag sIds
 */

export type DimensionLabel = {
  name: string;
  // Only agents and users have one; null for every other dimension.
  pictureUrl: string | null;
  // Only agents and skills have one; null for every other dimension.
  description: string | null;
  // Only agents have model metadata.
  modelId?: string;
  modelDisplayName?: string;
  // Only tools and skills have an icon.
  icon?: string | null;
  // Facet metadata used to classify agents and models in filter controls.
  scope?: AgentConfigurationScope;
  maker?: ModelMakerIdType;
  tier?: ModelsTierName;
  // Only groups have one; this is the current active membership count.
  memberCount?: number;
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
  dimension: ConsumptionTopDimension,
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
              ...(label?.scope ? { scope: label.scope } : {}),
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
      const keySet = new Set(keys);
      const groupsToResolve = groups.filter((group) => keySet.has(group.sId));
      const groupsWithMemberCounts = await GroupResource.toJSONWithMemberCounts(
        auth,
        groupsToResolve
      );
      const groupsById = new Map(
        groupsWithMemberCounts.map((group) => [group.sId, group])
      );

      return new Map(
        keys.map((key) => {
          const group = groupsById.get(key);
          return [
            key,
            {
              name: group?.name ?? key,
              pictureUrl: null,
              description: null,
              memberCount: group?.memberCount ?? 0,
            },
          ];
        })
      );
    }

    case "model":
      return new Map(
        keys.map((key) => {
          const model = getModelConfigByModelId(key);
          const tier = model
            ? getTierForModel(model.modelId, model.defaultReasoningEffort)
            : null;
          return [
            key,
            {
              name: model?.displayName ?? key,
              pictureUrl: null,
              description: null,
              ...(model ? { maker: getModelMaker(model) } : {}),
              ...(tier ? { tier } : {}),
            },
          ];
        })
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

    case "conversation": {
      const conversations = await ConversationResource.fetchByIds(auth, keys, {
        includeDeleted: true,
      });
      const titlesById = new Map(
        conversations.map((conversation) => [
          conversation.sId,
          getConversationDisplayTitle({
            created: conversation.createdAt.getTime(),
            forkingData: conversation.forkingData,
            title: conversation.title,
          }),
        ])
      );
      return labelsFromNames(titlesById);
    }

    case "tag": {
      const tags = await TagResource.fetchByIds(auth, keys);
      const namesById = new Map(tags.map((tag) => [tag.sId, tag.name]));
      return labelsFromNames(
        new Map(keys.map((key) => [key, namesById.get(key) ?? key]))
      );
    }

    case "reasoning_effort":
      return labelsFromNames(
        new Map(keys.map((key) => [key, capitalize(key)]))
      );

    default:
      assertNever(dimension);
  }
}

export async function resolveDimensionDisplayNames(
  auth: Authenticator,
  dimension: ConsumptionTopDimension,
  groupKeys: string[]
): Promise<Map<string, string>> {
  const labels = await resolveDimensionLabels(auth, dimension, groupKeys);
  return new Map([...labels].map(([key, label]) => [key, label.name]));
}
