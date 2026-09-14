import { createAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import {
  AUTO_COMPLEX_MODEL_ID,
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_ID,
} from "@app/types/assistant/models/auto";

import type {
  AgentAsset,
  AgentAssetModel,
  CreatedAgent,
  SeedContext,
} from "./types";

interface SeedAgentOptions {
  skills?: SkillResource[];
  additionalEditors?: UserResource[];
  // Create the agent on behalf of this user, making them its author and only editor (on top of
  // `additionalEditors`). Defaults to the context user.
  owner?: UserResource;
  // Spaces the agent requires access to. Users who are not members of these spaces do not see
  // the agent at all.
  spaces?: SpaceResource[];
}

function resolveModel(
  model: AgentAssetModel = "standard"
): Pick<
  AgentModelConfigurationType,
  "providerId" | "modelId" | "reasoningEffort"
> {
  switch (model) {
    case "basic":
      return {
        providerId: AUTO_FAST_MODEL_ID,
        modelId: AUTO_FAST_MODEL_ID,
        reasoningEffort: "none",
      };
    case "standard":
      return {
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
        reasoningEffort: "none",
      };
    case "premium":
      return {
        providerId: AUTO_COMPLEX_MODEL_ID,
        modelId: AUTO_COMPLEX_MODEL_ID,
        reasoningEffort: "none",
      };
    default:
      return model;
  }
}

export async function seedAgent(
  ctx: SeedContext,
  agentAsset: AgentAsset,
  options: SeedAgentOptions = {}
): Promise<CreatedAgent | null> {
  const { auth, user, execute, logger } = ctx;
  const { skills = [], additionalEditors = [], owner, spaces = [] } = options;

  // Looked up on the model rather than through the context user's view: seeded agents may be
  // unpublished or require spaces the context user is not a member of, and a re-run must still
  // find them (agent names are unique among a workspace's active agents).
  const existingAgent = await AgentConfigurationModel.findOne({
    attributes: ["sId"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      name: agentAsset.name,
      status: "active",
    },
  });

  if (existingAgent) {
    logger.info(
      { sId: existingAgent.sId, name: agentAsset.name },
      "Agent already exists, skipping"
    );
    return { sId: existingAgent.sId, name: agentAsset.name };
  }

  if (execute) {
    // The agent is attributed to its author and editors, but written with the context user's
    // admin auth: seeded authors are plain workspace members, who may not hold the workspace
    // permission to create or publish agents.
    const author = owner ?? user;

    // Determine editors: author + additional editors if specified
    const editors = [author.toJSON()];
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
      scope: agentAsset.scope ?? "visible",
      model: {
        ...resolveModel(agentAsset.model),
        temperature: 0.7,
        responseFormat: agentAsset.responseFormat,
      },
      templateId: null,
      requestedSpaceIds: spaces.map((space) => space.id),
      tags: [],
      editors,
      authorId: author.id,
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
        { skillId: skill.sId, agentId: agentConfiguration.sId },
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
