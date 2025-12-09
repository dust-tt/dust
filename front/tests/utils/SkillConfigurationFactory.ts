import assert from "assert";

import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import type { ModelId } from "@app/types";

export class SkillConfigurationFactory {
  static async create(
    auth: Authenticator,
    overrides: Partial<{
      name: string;
      description: string;
      instructions: string;
      status: "active" | "archived";
      scope: "private" | "workspace";
      version: number;
    }> = {}
  ): Promise<SkillConfigurationModel> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.user();
    assert(user, "User is required");

    const name = overrides.name ?? "Test Skill";
    const description = overrides.description ?? "Test skill description";
    const instructions = overrides.instructions ?? "Test skill instructions";
    const status = overrides.status ?? "active";
    const scope = overrides.scope ?? "private";
    const version = overrides.version ?? 1;

    const skill = await SkillConfigurationModel.create({
      workspaceId: workspace.id,
      authorId: user.id,
      name,
      description,
      instructions,
      status,
      scope,
      version,
      requestedSpaceIds: [],
    });

    return skill;
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
}
