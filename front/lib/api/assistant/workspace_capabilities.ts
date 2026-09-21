import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  isToolWithKnowledge,
} from "@app/lib/actions/mcp_helper";
import { getWhitelistedProviders } from "@app/lib/api/assistant/models";
import config from "@app/lib/api/config";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { filterEnabledModels } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type {
  DataSourceViewCategory,
  KnowledgeCategory,
} from "@app/types/api/public/spaces";
import { KNOWLEDGE_CATEGORIES } from "@app/types/api/public/spaces";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { USED_MODEL_CONFIGS } from "@app/types/assistant/models/used_model_configs";
import { CoreAPI } from "@app/types/core/core_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export interface AvailableTool {
  sId: string;
  name: string;
  description: string;
  serverType: MCPServerViewType["serverType"];
  availability: MCPServerViewType["server"]["availability"];
}

const KNOWLEDGE_CATEGORIES_SET = new Set<DataSourceViewCategory>(
  KNOWLEDGE_CATEGORIES
);

export interface SearchKnowledgeDataSourceView {
  dataSourceViewId: string;
  name: string;
  connectorProvider: string | null;
  category: DataSourceViewCategory;
  spaceId: string;
  // Only set in search mode: how many of the returned nodes belong to this view.
  childrenCount?: number;
}

export interface SearchKnowledgeNode {
  nodeId: string;
  title: string;
  parentFolderId: string;
  parents: string[];
  dataSourceViewId: string;
  spaceId: string;
  hasChildren: boolean;
  connectorProvider: string | null;
  sourceUrl: string | null;
}

export interface SearchKnowledgeResult {
  // Browse mode (no query): every knowledge view. Search mode: the views with at least one hit.
  dataSourceViews: SearchKnowledgeDataSourceView[];
  // Empty in browse mode.
  nodes: SearchKnowledgeNode[];
  // How many knowledge views the caller can reach at all, so callers can tell an empty search
  // from a workspace without knowledge.
  totalDataSourceViews: number;
}

export interface AvailableSkill {
  sId: string;
  name: string;
  userFacingDescription: string;
  agentFacingDescription: string;
  icon: string | null;
  toolIds: string[];
}

/**
 * Get the list of available models for the workspace.
 * This filters USED_MODEL_CONFIGS and CUSTOM_MODEL_CONFIGS based on feature flags,
 * plan, and workspace provider whitelisting.
 */
export async function getAvailableModelsForWorkspace(
  auth: Authenticator
): Promise<ModelConfigurationType[]> {
  const featureFlags = await getFeatureFlags(auth);
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.plan();
  const region = regionConfig.getCurrentRegion();
  const whitelistedProviders = getWhitelistedProviders(auth);

  const allUsedModels = [...USED_MODEL_CONFIGS, ...CUSTOM_MODEL_CONFIGS];
  return filterEnabledModels(allUsedModels, {
    featureFlags,
    plan,
    regionalModelsOnly: owner.regionalModelsOnly,
    region,
    whitelistedProviders,
  });
}

/**
 * List sIds of active workspace agents whose model is not available in
 * the current region. Used to gate enabling `regionalModelsOnly` on a
 * workspace — admins must not strand existing agents.
 */
export async function listActiveAgentsUsingNonRegionalModels(
  auth: Authenticator
): Promise<string[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const region = regionConfig.getCurrentRegion();

  // Match against the full catalog: existing agents may use older
  // still-supported models no longer surfaced in the picker.
  const regionalModelKeys = new Set<string>();
  for (const m of SUPPORTED_MODEL_CONFIGS) {
    if (m.regionalAvailability[region] === true) {
      regionalModelKeys.add(`${m.providerId}:${m.modelId}`);
    }
  }

  const activeAgents = await AgentConfigurationModel.findAll({
    where: { workspaceId, status: "active" },
    attributes: ["sId", "providerId", "modelId"],
  });

  return activeAgents
    .filter(
      (agent) => !regionalModelKeys.has(`${agent.providerId}:${agent.modelId}`)
    )
    .map((agent) => agent.sId);
}

/**
 * Lists available tools (MCP server views) that can be added to agents.
 * Returns tools from all spaces the user is a member of, filtered to only
 * include tools with "manual" or "auto" availability.
 * Excludes knowledge tools (search, query tables, include data, etc.) that
 * require data source configuration, these are handled separately as knowledge.
 */
export async function listAvailableTools(
  auth: Authenticator
): Promise<AvailableTool[]> {
  // Get all spaces the user is member of that can provide tools.
  const userSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth, {
    kinds: ["global", "regular"],
  });

  // Fetch all MCP server views from those spaces.
  const mcpServerViews =
    await MCPServerViewResource.listBySpacesEnsuringAutoViews(
      auth,
      userSpaces,
      {
        includeHeavyAttributes: [
          "authorization",
          "cachedTools",
          "customHeaders",
          "lastError",
          "sharedSecret",
        ],
      }
    );

  return mcpServerViews
    .map((v) => v.toJSON())
    .filter((v): v is MCPServerViewType => v !== null)
    .filter(
      (v) =>
        v.server.availability === "manual" || v.server.availability === "auto"
    )
    .filter((v) => !isToolWithKnowledge(v))
    .map((mcpServerView) => ({
      sId: mcpServerView.sId,
      name: getMcpServerViewDisplayName(mcpServerView),
      description: getMcpServerViewDescription(mcpServerView),
      serverType: mcpServerView.serverType,
      availability: mcpServerView.server.availability,
    }));
}

/**
 * Lists available skills that can be added to agents.
 * Returns active skills from the workspace that the user has access to.
 */
export async function listAvailableSkills(
  auth: Authenticator
): Promise<AvailableSkill[]> {
  const skills = await SkillResource.listByWorkspace(auth, {
    status: "active",
  });

  return skills.map((skill) => ({
    sId: skill.sId,
    name: skill.name,
    userFacingDescription: skill.userFacingDescription,
    agentFacingDescription: skill.agentFacingDescription,
    icon: skill.icon,
    toolIds: skill.mcpServerViews.map((v) => v.sId),
  }));
}

/**
 * Fetch detailed information about a specific MCP server by its sId.
 * Returns the MCPServerType (including its tools list) or null if not found.
 */
export async function describeMcpServer(
  auth: Authenticator,
  mcpId: string
): Promise<MCPServerType | null> {
  const [view] = await MCPServerViewResource.fetchByIds(auth, [mcpId], {
    includeHeavyAttributes: [
      "authorization",
      "cachedTools",
      "customHeaders",
      "lastError",
      "sharedSecret",
    ],
  });
  // A view the caller cannot read or admin is reported like an unknown id, so that the tool names and
  // schemas of restricted spaces are not disclosed.
  if (!view || !view.canReadOrAdministrate(auth)) {
    return null;
  }
  return view.toJSON()?.server ?? null;
}

/**
 * Lists the knowledge data source views of the spaces the caller is a member of, optionally
 * narrowed to one category.
 */
async function listKnowledgeDataSourceViews(
  auth: Authenticator,
  category?: KnowledgeCategory
): Promise<DataSourceViewResource[]> {
  const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const allViews = await DataSourceViewResource.listBySpaces(auth, spaces);

  return allViews.filter((dsv) => {
    const dsvCategory = dsv.toJSON().category;
    if (category) {
      return dsvCategory === category;
    }
    return KNOWLEDGE_CATEGORIES_SET.has(dsvCategory);
  });
}

/**
 * Browses (no query) or semantically searches (query) the workspace knowledge an agent or skill
 * can be given. Shared by the copilot, reinforcement and workspace_management servers.
 */
/**
 * @cc [owner:fabiencelier,label:security] search-knowledge-scoped-to-caller-spaces
 * Both the returned views and the searched documents MUST come only from data source views of
 * spaces the caller is a member of; views of other spaces MUST NOT be listed nor searched.
 */
export async function searchKnowledge(
  auth: Authenticator,
  {
    query,
    topK,
    category,
  }: {
    query?: string;
    topK: number;
    category?: KnowledgeCategory;
  }
): Promise<Result<SearchKnowledgeResult, Error>> {
  const dataSourceViews = await listKnowledgeDataSourceViews(auth, category);

  const dataSourceEntries = dataSourceViews.map((view) => {
    const viewJson = view.toJSON();
    const dataSource = viewJson.dataSource;
    return {
      apiId: dataSource.dustAPIDataSourceId,
      dataSourceView: {
        dataSourceViewId: view.sId,
        name: getDisplayNameForDataSource(dataSource),
        connectorProvider: dataSource.connectorProvider,
        category: viewJson.category,
        spaceId: viewJson.spaceId,
      } satisfies SearchKnowledgeDataSourceView,
      searchArg: {
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        view_filter: view.toViewFilter(),
      },
      documentTitles: <string[]>[],
    };
  });

  const totalDataSourceViews = dataSourceEntries.length;

  // Browse mode: no query, return all views with no nodes.
  if (!query) {
    return new Ok({
      dataSourceViews: dataSourceEntries.map((entry) => entry.dataSourceView),
      nodes: [],
      totalDataSourceViews,
    });
  }

  if (totalDataSourceViews === 0) {
    return new Ok({ dataSourceViews: [], nodes: [], totalDataSourceViews });
  }

  // Search mode: semantic search, return matching views + individual nodes.
  const dataSourceByDustAPIId = new Map(
    dataSourceEntries.map((entry) => [entry.apiId, entry])
  );

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const credentials = await getLlmCredentials(auth);
  const searchResults = await coreAPI.bulkSearchDataSources(
    query,
    topK,
    credentials,
    false,
    dataSourceEntries.map((entry) => entry.searchArg)
  );

  if (searchResults.isErr()) {
    return new Err(new Error(searchResults.error.message));
  }

  const nodes: SearchKnowledgeNode[] = [];

  for (const document of searchResults.value.documents) {
    const entry = dataSourceByDustAPIId.get(document.data_source_id);
    if (entry) {
      entry.documentTitles.push(document.title ?? document.document_id);
      const ancestors = document.parents.filter(
        (p) => p !== document.document_id
      );
      nodes.push({
        nodeId: document.document_id,
        title: document.title ?? document.document_id,
        parentFolderId:
          document.parent_id ?? entry.dataSourceView.dataSourceViewId,
        parents: [...ancestors, entry.dataSourceView.dataSourceViewId],
        dataSourceViewId: entry.dataSourceView.dataSourceViewId,
        spaceId: entry.dataSourceView.spaceId,
        hasChildren: false,
        connectorProvider: entry.dataSourceView.connectorProvider,
        sourceUrl: document.source_url ?? null,
      });
    }
  }

  const roots = dataSourceEntries
    .filter((entry) => entry.documentTitles.length > 0)
    .map((entry) => ({
      ...entry.dataSourceView,
      childrenCount: entry.documentTitles.length,
    }));

  return new Ok({ dataSourceViews: roots, nodes, totalDataSourceViews });
}
