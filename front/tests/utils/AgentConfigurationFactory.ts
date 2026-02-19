import { createAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import assert from "assert";

export class AgentConfigurationFactory {
  static async createTestAgent(
    auth: Authenticator,
    overrides: Partial<{
      name: string;
      description: string;
      scope: Exclude<AgentConfigurationType["scope"], "global">;
      model: {
        providerId: ModelProviderIdType;
        modelId: ModelIdType;
        temperature?: number;
      };
    }> = {}
  ): Promise<AgentConfigurationType> {
    const name = overrides.name ?? "Test Agent";
    const description = overrides.description ?? "Test Agent Description";
    const scope = overrides.scope ?? "visible";
    const providerId = overrides.model?.providerId ?? "openai";
    const modelId = overrides.model?.modelId ?? "gpt-4-turbo";
    const temperature = overrides.model?.temperature ?? 0.7;

    const user = auth.user();
    assert(user, "User is required");

    const result = await createAgentConfiguration(auth, {
      name,
      description,
      instructions: "Test Instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope,
      model: {
        providerId,
        modelId,
        temperature,
      },
      templateId: null,
      requestedSpaceIds: [],
      tags: [], // Added missing tags property
      editors: [user.toJSON()],
    });

    if (result.isErr()) {
      throw result.error;
    }

    return { ...result.value, instructionsHtml: null, actions: [] };
  }

  /**
   * Updates an existing agent configuration, creating a new version.
   * Pass the sId of the existing agent to update it.
   */
  static async updateTestAgent(
    auth: Authenticator,
    agentId: string,
    overrides: Partial<{
      name: string;
      description: string;
      instructions: string;
      instructionsHtml: string | null;
    }> = {}
  ): Promise<AgentConfigurationType> {
    const user = auth.user();
    assert(user, "User is required");

    const result = await createAgentConfiguration(auth, {
      name: overrides.name ?? "Test Agent",
      description: overrides.description ?? "Test Agent Description",
      instructions: overrides.instructions ?? "Updated Test Instructions",
      instructionsHtml: overrides.instructionsHtml ?? null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "visible",
      model: {
        providerId: "openai",
        modelId: "gpt-4-turbo",
        temperature: 0.7,
      },
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      agentConfigurationId: agentId,
    });

    if (result.isErr()) {
      throw result.error;
    }

    return {
      ...result.value,
      instructionsHtml: overrides.instructionsHtml ?? null,
      actions: [],
    };
  }
}
