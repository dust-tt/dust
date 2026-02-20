import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { isModelAvailableAndWhitelisted } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
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
  userFacingDescription: string | null;
  agentFacingDescription: string | null;
  icon: string | null;
  toolSIds: string[];
}

/**
 * Get the list of available models for the workspace.
 * This filters USED_MODEL_CONFIGS and CUSTOM_MODEL_CONFIGS based on feature flags,
 * plan, and workspace provider whitelisting.
 */
export async function getAvailableModelsForWorkspace(
  auth: Authenticator
): Promise<ModelConfigurationType[]> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.plan();
  const featureFlags = await getFeatureFlags(owner);

  const allUsedModels = [...USED_MODEL_CONFIGS, ...CUSTOM_MODEL_CONFIGS];
  return allUsedModels.filter((m) =>
    isModelAvailableAndWhitelisted(m, featureFlags, plan, owner)
  );
}

/**
 * Lists available tools (MCP server views) that can be added to agents.
 * Returns tools from all spaces the user is a member of, filtered to only
 * include tools with "manual" or "auto" availability.
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
    toolSIds: skill.mcpServerViews.map((v) => v.sId),
  }));
}
