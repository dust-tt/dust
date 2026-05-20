import { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  isToolWithKnowledge,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import { config as regionConfig } from "@app/lib/api/regions/config";
import {
  filterCustomAvailableAndWhitelistedModels,
  getWhitelistedProviders,
} from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export interface AvailableTool {
  sId: string;
  name: string;
  description: string;
  serverType: MCPServerViewType["serverType"];
  availability: MCPServerViewType["server"]["availability"];
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
  return filterCustomAvailableAndWhitelistedModels(allUsedModels, {
    featureFlags,
    plan,
    owner,
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
  // Get all spaces the user is member of.
  const userSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);

  // Fetch all MCP server views from those spaces.
  const mcpServerViews = await MCPServerViewResource.listBySpaces(
    auth,
    userSpaces
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
  const [view] = await MCPServerViewResource.fetchByIds(auth, [mcpId]);
  return view?.toJSON()?.server ?? null;
}
