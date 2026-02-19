import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillAttachedKnowledge } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SKILL_ICON } from "@app/lib/skill";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";

export class SkillFactory {
  static async create(
    auth: Authenticator,
    overrides: Partial<{
      name: string;
      agentFacingDescription: string;
      userFacingDescription: string;
      instructions: string;
      status: SkillStatus;
      version: number;
      requestedSpaceIds: ModelId[];
      attachedKnowledge: SkillAttachedKnowledge[];
      mcpServerViews: MCPServerViewResource[];
    }> = {}
  ): Promise<SkillResource> {
    const user = auth.user();
    assert(user, "User is required");

    const name = overrides.name ?? "Test Skill";
    const agentFacingDescription =
      overrides.agentFacingDescription ?? "Test skill agent facing description";
    const userFacingDescription =
      overrides.userFacingDescription ?? "Test skill user facing description";
    const instructions = overrides.instructions ?? "Test skill instructions";
    const status = overrides.status ?? "active";
    const editedBy = overrides.status === "suggested" ? null : user.id;
    const requestedSpaceIds = overrides.requestedSpaceIds ?? [];
    const attachedKnowledge = overrides.attachedKnowledge ?? [];
    const mcpServerViews = overrides.mcpServerViews ?? [];

    return SkillResource.makeNew(
      auth,
      {
        editedBy,
        agentFacingDescription,
        userFacingDescription,
        instructions,
        name,
        requestedSpaceIds,
        status,
        icon: SKILL_ICON.name,
      },
      {
        mcpServerViews,
        attachedKnowledge,
      }
    );
  }

  static async linkToAgent(
    auth: Authenticator,
    {
      skillId,
      agentConfigurationId,
    }: {
      skillId: ModelId;
      agentConfigurationId: ModelId;
    }
  ): Promise<AgentSkillModel> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkill = await AgentSkillModel.create({
      workspaceId: workspace.id,
      customSkillId: skillId,
      globalSkillId: null,
      agentConfigurationId,
    });

    return agentSkill;
  }

  static async linkGlobalSkillToAgent(
    auth: Authenticator,
    {
      globalSkillId,
      agentConfigurationId,
    }: {
      globalSkillId: string;
      agentConfigurationId: ModelId;
    }
  ): Promise<AgentSkillModel> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkill = await AgentSkillModel.create({
      workspaceId: workspace.id,
      customSkillId: null,
      globalSkillId,
      agentConfigurationId,
    });

    return agentSkill;
  }
}
