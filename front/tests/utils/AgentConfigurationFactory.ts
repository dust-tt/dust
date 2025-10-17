import assert from "assert";

import { createAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import type {
  LightAgentConfigurationType,
  ModelIdType,
  ModelProviderIdType,
} from "@app/types";

export class AgentConfigurationFactory {
  static async createTestAgent(
    auth: Authenticator,
    overrides: Partial<{
      name: string;
      description: string;
      scope: Exclude<LightAgentConfigurationType["scope"], "global">;
      model: {
        providerId: ModelProviderIdType;
        modelId: ModelIdType;
        temperature?: number;
      };
    }> = {}
  ): Promise<LightAgentConfigurationType> {
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
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope,
      model: {
        providerId,
        modelId,
        temperature,
      },
      templateId: null,
      requestedGroupIds: [], // Let createAgentConfiguration handle group creation
      tags: [], // Added missing tags property
      editors: [user.toJSON()],
    });

    if (result.isErr()) {
      throw result.error;
    }

    return result.value;
  }
}
