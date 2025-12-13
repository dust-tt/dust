import assert from "assert";

import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { ModelId } from "@app/types";

export class SkillConfigurationFactory {
  static async create(
    auth: Authenticator,
    overrides: Partial<{
      name: string;
      description: string;
      instructions: string;
      status: "active" | "archived";
    }> = {}
  ): Promise<SkillResource> {
    const user = auth.user();
    assert(user, "User is required");

    const name = overrides.name ?? "Test Skill";
    const description = overrides.description ?? "Test skill description";
    const instructions = overrides.instructions ?? "Test skill instructions";
    const status = overrides.status ?? "active";

    return SkillResource.makeNew(auth, {
      authorId: user.id,
      agentFacingDescription: description,
      instructions,
      name,
      requestedSpaceIds: [],
      status,
    });
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
