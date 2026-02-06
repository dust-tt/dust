import {
  createAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

import type { AgentAsset, CreatedAgent, SeedContext } from "./types";

export interface SeedAgentOptions {
  skills?: SkillResource[];
  additionalEditors?: UserResource[];
}

export async function seedAgent(
  ctx: SeedContext,
  agentAsset: AgentAsset,
  options: SeedAgentOptions = {}
): Promise<CreatedAgent | null> {
  const { auth, user, execute, logger } = ctx;
  const { skills = [], additionalEditors = [] } = options;

  const existingAgents = await searchAgentConfigurationsByName(
    auth,
    agentAsset.name
  );
  const existingAgent = existingAgents.find((a) => a.name === agentAsset.name);

  if (existingAgent) {
    logger.info(
      { sId: existingAgent.sId, name: agentAsset.name },
      "Agent already exists, skipping"
    );
    return { sId: existingAgent.sId, name: agentAsset.name };
  }

  if (execute) {
    // Determine editors: main user + additional editors if specified
    const editors = [user.toJSON()];
    if (agentAsset.sharedWithAdditionalUsers) {
      for (const additionalUser of additionalEditors) {
        editors.push(additionalUser.toJSON());
      }
    }

    const result = await createAgentConfiguration(auth, {
      name: agentAsset.name,
      description: agentAsset.description,
      instructions: agentAsset.instructions,
      instructionsHtml: null,
      pictureUrl: agentAsset.pictureUrl,
      status: "active",
      scope: "visible",
      model: {
        providerId: "anthropic",
        modelId: "claude-4-sonnet-20250514",
        temperature: 0.7,
      },
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors,
    });

    if (result.isErr()) {
      throw result.error;
    }

    const agentConfiguration = result.value;
    logger.info(
      { sId: agentConfiguration.sId, name: agentAsset.name },
      "Agent created"
    );

    // Link skills to the agent
    for (const skill of skills) {
      await skill.addToAgent(auth, agentConfiguration);
      logger.info(
        { skillSId: skill.sId, agentSId: agentConfiguration.sId },
        "Skill linked to agent"
      );
    }

    return { sId: agentConfiguration.sId, name: agentAsset.name };
  }

  return null;
}

export async function seedAgents(
  ctx: SeedContext,
  agentAssets: AgentAsset[],
  options: SeedAgentOptions = {}
): Promise<Map<string, CreatedAgent>> {
  const createdAgents = new Map<string, CreatedAgent>();

  for (const agentAsset of agentAssets) {
    const agent = await seedAgent(ctx, agentAsset, options);
    if (agent) {
      createdAgents.set(agent.name, agent);
    }
  }

  return createdAgents;
}
