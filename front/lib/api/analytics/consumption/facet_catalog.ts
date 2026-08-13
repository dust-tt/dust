import {
  getMcpServerDisplayName,
  getMcpServerViewDisplayName,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import { SOURCE_ORIGIN_LABELS } from "@app/lib/api/analytics/source_labels";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import type { MCPServerTypeWithViews } from "@app/lib/api/mcp";
import { listMCPServersWithViews } from "@app/lib/api/mcp/servers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { GroupResource } from "@app/lib/resources/group_resource";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import tracer from "@app/logger/tracer";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type ConsumptionFacetCatalogEntry = {
  value: string;
  label: string;
  pictureUrl: string | null;
  icon?: string | null;
  scope?: AgentConfigurationScope;
  maker?: ModelMakerIdType;
  tier?: ModelsTierName;
};

export type ConsumptionFacetCatalog = Record<
  ConsumptionScopeDimension,
  ConsumptionFacetCatalogEntry[]
>;

type ConsumptionFacetCatalogSource =
  | "members"
  | "groups"
  | "agents"
  | "models"
  | "mcp_servers"
  | "skills";

function traceFacetCatalogLoad<T>(
  source: ConsumptionFacetCatalogSource,
  fn: () => Promise<T[]>
): Promise<T[]> {
  return tracer.trace(
    "analytics.consumption.facets.catalog.load",
    { resource: source },
    async (span) => {
      span?.setTag("facet.catalog_source", source);
      const entries = await fn();
      span?.setTag("facet.catalog_source_entry_count", entries.length);
      return entries;
    }
  );
}

function toolFacetCatalogEntries(
  mcpServers: MCPServerTypeWithViews[]
): ConsumptionFacetCatalogEntry[] {
  const entries = mcpServers.flatMap<ConsumptionFacetCatalogEntry>((server) => {
    if (!isRemoteMCPServerType(server)) {
      return [
        {
          value: server.name,
          label: getMcpServerDisplayName(server),
          pictureUrl: null,
          icon: server.icon,
        },
      ];
    }

    // Remote tool documents store a name in `tool.server_name`. They do not
    // store the remote server ID. The name comes from the action name override,
    // then the view name, then the server name. This list covers view and server
    // names. Elasticsearch adds action name overrides and old names found in
    // the selected period. Using the server ID here would never match the
    // indexed data and would show a disabled duplicate in the UI.
    return server.views.map((view) => ({
      value: view.name ?? server.name,
      label: getMcpServerViewDisplayName(view),
      pictureUrl: null,
      icon: view.server.icon,
    }));
  });

  // The same remote server can have several views with the same name. Keep one
  // filter option for that name.
  return [...new Map(entries.map((entry) => [entry.value, entry])).values()];
}

async function listMemberFacetCatalog(
  auth: Authenticator
): Promise<ConsumptionFacetCatalogEntry[]> {
  const members = await traceFacetCatalogLoad("members", async () => {
    const result = await getMembers(auth, { activeOnly: true });
    return result.members;
  });
  return members.map((member) => ({
    value: member.sId,
    label: member.fullName,
    pictureUrl: member.image,
  }));
}

async function listGroupFacetCatalog(
  auth: Authenticator
): Promise<ConsumptionFacetCatalogEntry[]> {
  const groups = await traceFacetCatalogLoad("groups", () =>
    GroupResource.listAllWorkspaceGroups(auth, {
      groupKinds: [...MANAGEABLE_GROUP_KINDS],
    })
  );
  return groups.map((group) => ({
    value: group.sId,
    label: group.name,
    pictureUrl: null,
  }));
}

async function listAgentFacetCatalog(
  auth: Authenticator
): Promise<ConsumptionFacetCatalogEntry[]> {
  const agents = await traceFacetCatalogLoad("agents", () =>
    getAgentConfigurationsForView({
      auth,
      agentsGetView: "analytics",
      variant: "extra_light",
      omitInstructions: true,
    })
  );
  return agents.map((agent) => ({
    value: agent.sId,
    label: agent.name,
    pictureUrl: agent.pictureUrl,
    scope: agent.scope,
  }));
}

async function listModelFacetCatalog(
  auth: Authenticator
): Promise<ConsumptionFacetCatalogEntry[]> {
  const models = await traceFacetCatalogLoad("models", async () => {
    const result = await getModelsForAuth(auth);
    return result.models;
  });
  return models
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
    }));
}

async function listToolFacetCatalog(
  auth: Authenticator
): Promise<ConsumptionFacetCatalogEntry[]> {
  const mcpServers = await traceFacetCatalogLoad("mcp_servers", () =>
    listMCPServersWithViews(auth)
  );
  return toolFacetCatalogEntries(mcpServers);
}

async function listSkillFacetCatalog(
  auth: Authenticator
): Promise<ConsumptionFacetCatalogEntry[]> {
  const skills = await traceFacetCatalogLoad("skills", () =>
    SkillResource.listByWorkspace(auth, {
      status: "active",
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    })
  );
  return skills.map((skill) => ({
    value: skill.sId,
    label: skill.name,
    pictureUrl: null,
    icon: skill.icon,
  }));
}

function listSourceFacetCatalog(): ConsumptionFacetCatalogEntry[] {
  return Object.entries(SOURCE_ORIGIN_LABELS).map(([value, label]) => ({
    value,
    label,
    pictureUrl: null,
  }));
}

export async function listConsumptionFacetCatalogDimension(
  auth: Authenticator,
  dimension: ConsumptionScopeDimension
): Promise<ConsumptionFacetCatalogEntry[]> {
  switch (dimension) {
    case "agent":
      return listAgentFacetCatalog(auth);
    case "user":
      return listMemberFacetCatalog(auth);
    case "group":
      return listGroupFacetCatalog(auth);
    case "model":
      return listModelFacetCatalog(auth);
    case "tool":
      return listToolFacetCatalog(auth);
    case "skill":
      return listSkillFacetCatalog(auth);
    case "source":
      return listSourceFacetCatalog();
    default:
      return assertNever(dimension);
  }
}

/** Lists current workspace entities that can be selected as consumption filters. */
async function listConsumptionFacetCatalogWithoutTracing(
  auth: Authenticator
): Promise<ConsumptionFacetCatalog> {
  // TODO(2026-08-11 OBSERVABILITY): This eagerly loads several complete
  // workspace catalogs and is known to perform poorly on large workspaces.
  // Move most facet metadata into Elasticsearch so this endpoint can query ES
  // instead of loading several unbounded database-backed catalogs.
  const members = await listMemberFacetCatalog(auth);
  const groups = await listGroupFacetCatalog(auth);
  const agents = await listAgentFacetCatalog(auth);
  const models = await listModelFacetCatalog(auth);
  const tools = await listToolFacetCatalog(auth);
  const skills = await listSkillFacetCatalog(auth);

  return {
    agent: agents,
    user: members,
    group: groups,
    model: models,
    tool: tools,
    skill: skills,
    source: listSourceFacetCatalog(),
  };
}

export async function listConsumptionFacetCatalog(
  auth: Authenticator
): Promise<ConsumptionFacetCatalog> {
  return tracer.trace("analytics.consumption.facets.catalog", async (span) => {
    span?.setTag("workspace.id", auth.getNonNullableWorkspace().sId);
    return listConsumptionFacetCatalogWithoutTracing(auth);
  });
}
