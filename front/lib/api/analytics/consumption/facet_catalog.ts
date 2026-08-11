import {
  getMcpServerDisplayName,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import { SOURCE_ORIGIN_LABELS } from "@app/lib/api/analytics/source_labels";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import { listMCPServersWithViews } from "@app/lib/api/mcp/servers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { GroupResource } from "@app/lib/resources/group_resource";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";

export type ConsumptionFacetCatalogEntry = {
  value: string;
  label: string;
  pictureUrl: string | null;
  scope?: AgentConfigurationScope;
  maker?: ModelMakerIdType;
  tier?: ModelsTierName;
};

export type ConsumptionFacetCatalog = Record<
  ConsumptionScopeDimension,
  ConsumptionFacetCatalogEntry[]
>;

/** Lists current workspace entities that can be selected as consumption filters. */
export async function listConsumptionFacetCatalog(
  auth: Authenticator
): Promise<ConsumptionFacetCatalog> {
  // TODO(2026-08-11 OBSERVABILITY): This eagerly loads several complete
  // workspace catalogs and is known to perform poorly on large workspaces.
  // Move most facet metadata into Elasticsearch so this endpoint can query ES
  // instead of loading several unbounded database-backed catalogs.
  const { members } = await getMembers(auth, { activeOnly: true });
  const groups = await GroupResource.listAllWorkspaceGroups(auth, {
    groupKinds: [...MANAGEABLE_GROUP_KINDS],
  });
  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "all",
    variant: "extra_light",
    omitInstructions: true,
  });
  const { models } = await getModelsForAuth(auth);
  const mcpServers = await listMCPServersWithViews(auth);
  const skills = await SkillResource.listByWorkspace(auth, {
    status: "active",
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  return {
    agent: agents.map((agent) => ({
      value: agent.sId,
      label: agent.name,
      pictureUrl: agent.pictureUrl,
      scope: agent.scope,
    })),
    user: members.map((member) => ({
      value: member.sId,
      label: member.fullName,
      pictureUrl: member.image,
    })),
    team: groups.map((group) => ({
      value: group.sId,
      label: group.name,
      pictureUrl: null,
    })),
    model: models
      .filter((model) => !isModelStreamId(model.modelId))
      .map((model) => ({
        value: model.modelId,
        label: model.displayName,
        pictureUrl: null,
        maker: getModelMaker(model),
        tier:
          ModelsTierResource.getTierForModel(
            model.modelId,
            model.defaultReasoningEffort
          ) ?? undefined,
      })),
    tool: mcpServers.map((server) => ({
      value: isRemoteMCPServerType(server) ? server.sId : server.name,
      label: getMcpServerDisplayName(server),
      pictureUrl: null,
    })),
    skill: skills.map((skill) => ({
      value: skill.sId,
      label: skill.name,
      pictureUrl: null,
    })),
    source: Object.entries(SOURCE_ORIGIN_LABELS).map(([value, label]) => ({
      value,
      label,
      pictureUrl: null,
    })),
  };
}
