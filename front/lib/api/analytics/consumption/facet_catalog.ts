import {
  getMcpServerDisplayName,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import { SOURCE_ORIGIN_LABELS } from "@app/lib/api/analytics/source_labels";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import type { MCPServerViewDisplayMetadata } from "@app/lib/resources/mcp_server_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import tracer from "@app/logger/tracer";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";

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
  | "api_keys"
  | "groups"
  | "agents"
  | "models"
  | "mcp_servers"
  | "skills";

function traceFacetCatalogLoad<T>(
  source: ConsumptionFacetCatalogSource,
  dimension: ConsumptionScopeDimension,
  requestedDimension: ConsumptionScopeDimension | null,
  fn: () => Promise<T[]>
): Promise<T[]> {
  if (requestedDimension !== null && requestedDimension !== dimension) {
    return Promise.resolve([]);
  }

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
  mcpServerViews: MCPServerViewDisplayMetadata[]
): ConsumptionFacetCatalogEntry[] {
  const entries = mcpServerViews.flatMap<ConsumptionFacetCatalogEntry>(
    (view) => {
      if (view.serverType === "internal") {
        return [
          {
            value: view.serverName,
            label: getMcpServerDisplayName({
              sId: view.mcpServerId,
              name: view.serverName,
            }),
            pictureUrl: null,
            icon: view.icon,
          },
        ];
      }

      // Remote tool documents store a name in `tool.server_name`. They do not
      // store the remote server ID. The name comes from the action name override,
      // then the view name, then the server name. This list covers view and server
      // names. Elasticsearch adds action name overrides and old names found in
      // the selected period. Using the server ID here would never match the
      // indexed data and would show a disabled duplicate in the UI.
      return [
        {
          value: view.viewName ?? view.serverName,
          label: getMcpServerViewDisplayName({
            name: view.viewName,
            server: {
              sId: view.mcpServerId,
              name: view.serverName,
            },
          }),
          pictureUrl: null,
          icon: view.icon,
        },
      ];
    }
  );

  // The same remote server can have several views with the same name. Keep one
  // filter option for that name.
  return [...new Map(entries.map((entry) => [entry.value, entry])).values()];
}

/** Lists current workspace entities that can be selected as consumption filters. */
async function listConsumptionFacetCatalogWithoutTracing(
  auth: Authenticator,
  requestedDimension: ConsumptionScopeDimension | null = null
): Promise<ConsumptionFacetCatalog> {
  // TODO(2026-08-11 OBSERVABILITY): This eagerly loads several complete
  // workspace catalogs and is known to perform poorly on large workspaces.
  // Move most facet metadata into Elasticsearch so this endpoint can query ES
  // instead of loading several unbounded database-backed catalogs.
  const members = await traceFacetCatalogLoad(
    "members",
    "user",
    requestedDimension,
    async () => {
      const result = await getMembers(auth, { activeOnly: true });
      return result.members;
    }
  );
  const apiKeys = await traceFacetCatalogLoad(
    "api_keys",
    "api_key",
    requestedDimension,
    () =>
      KeyResource.listNonSystemKeysByWorkspace(auth.getNonNullableWorkspace())
  );
  const groups = await traceFacetCatalogLoad(
    "groups",
    "group",
    requestedDimension,
    () =>
      GroupResource.listAllWorkspaceGroups(auth, {
        groupKinds: [...MANAGEABLE_GROUP_KINDS],
      })
  );
  const agents = await traceFacetCatalogLoad(
    "agents",
    "agent",
    requestedDimension,
    () =>
      getAgentConfigurationsForView({
        auth,
        agentsGetView: "analytics",
        variant: "extra_light",
        omitHeavyAttributes: true,
      })
  );
  const models = await traceFacetCatalogLoad(
    "models",
    "model",
    requestedDimension,
    async () => {
      const result = await getModelsForAuth(auth);
      return result.models;
    }
  );
  const mcpServerViews = await traceFacetCatalogLoad(
    "mcp_servers",
    "tool",
    requestedDimension,
    () => MCPServerViewResource.listDisplayMetadataByWorkspace(auth)
  );
  const skills = await traceFacetCatalogLoad(
    "skills",
    "skill",
    requestedDimension,
    () =>
      SkillResource.listByWorkspace(auth, {
        status: "active",
        withInstructions: false,
        withTools: false,
        withFileAttachments: false,
      })
  );

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
    // API key names are not unique and are also the indexed grouping key.
    // Keep one selectable entry per name so the catalog matches ES buckets.
    api_key: [...new Set(apiKeys.map((apiKey) => apiKey.name))].map((name) => ({
      value: name,
      label: name,
      pictureUrl: null,
    })),
    group: groups.map((group) => ({
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
    tool: toolFacetCatalogEntries(mcpServerViews),
    skill: skills.map((skill) => ({
      value: skill.sId,
      label: skill.name,
      pictureUrl: null,
      icon: skill.icon,
    })),
    source: Object.entries(SOURCE_ORIGIN_LABELS).map(([value, label]) => ({
      value,
      label,
      pictureUrl: null,
    })),
  };
}

export async function listConsumptionFacetCatalogDimension(
  auth: Authenticator,
  dimension: ConsumptionScopeDimension
): Promise<ConsumptionFacetCatalogEntry[]> {
  const catalog = await listConsumptionFacetCatalogWithoutTracing(
    auth,
    dimension
  );
  return catalog[dimension];
}

export async function listConsumptionFacetCatalog(
  auth: Authenticator
): Promise<ConsumptionFacetCatalog> {
  return tracer.trace("analytics.consumption.facets.catalog", async (span) => {
    span?.setTag("workspace.id", auth.getNonNullableWorkspace().sId);
    return listConsumptionFacetCatalogWithoutTracing(auth);
  });
}
