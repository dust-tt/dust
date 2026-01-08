import assert from "assert";

import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { ModelId } from "@app/types";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";

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
    const authorId = overrides.status === "suggested" ? null : user.id;
    const requestedSpaceIds = overrides.requestedSpaceIds ?? [];

    return SkillResource.makeNew(
      auth,
      {
        authorId,
        agentFacingDescription,
        userFacingDescription,
        instructions,
        name,
        requestedSpaceIds,
        status,
      },
      {
        mcpServerViews: [],
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
