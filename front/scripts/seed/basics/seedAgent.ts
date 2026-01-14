import {
  createAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";

import type { AgentAsset, SeedContext } from "./types";

export async function seedAgent(
  ctx: SeedContext,
  agentAsset: AgentAsset
): Promise<string | null> {
  const { auth, user, execute, logger } = ctx;

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
    return existingAgent.sId;
  }

  if (execute) {
    const result = await createAgentConfiguration(auth, {
      name: agentAsset.name,
      description: agentAsset.description,
      instructions: agentAsset.instructions,
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
      editors: [user.toJSON()],
    });

    if (result.isErr()) {
      throw result.error;
    }

    const customAgentSId = result.value.sId;
    logger.info({ sId: customAgentSId }, "Custom agent created");
    return customAgentSId;
  }

  return null;
}
