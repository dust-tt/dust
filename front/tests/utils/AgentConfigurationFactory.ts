import assert from "assert";
import type { Transaction } from "sequelize";

import { createAgentConfiguration } from "@app/lib/api/assistant/configuration";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type {
  LightAgentConfigurationType,
  ModelIdType,
  ModelProviderIdType,
} from "@app/types";

export class AgentConfigurationFactory {
  static async createTestAgent(
    auth: Authenticator,
    t?: Transaction,
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

    const result = await createAgentConfiguration(
      auth,
      {
        name,
        description,
        instructions: "Test Instructions",
        maxStepsPerRun: 5,
        visualizationEnabled: false,
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
      },
      t
    );

    if (result.isErr()) {
      throw result.error;
    }

    return result.value;
  }

  static async createTestAgentWithMCPAction(
    auth: Authenticator,
    t: Transaction
  ): Promise<LightAgentConfigurationType> {
    const owner = auth.getNonNullableWorkspace();

    const agent = await AgentConfigurationFactory.createTestAgent(auth, t);
    const mcpServerView = await MCPServerViewFactory.create(
      owner,
      "dummy_mcp_server_id",
      await SpaceFactory.global(owner, t)
    );

    await AgentMCPServerConfiguration.create(
      {
        sId: generateRandomModelSId(),
        agentConfigurationId: agent.id,
        workspaceId: owner.id,
        mcpServerViewId: mcpServerView.id,
        internalMCPServerId: "internal_mcp_server_id",
        additionalConfiguration: {},
        timeFrame: null,
        jsonSchema: null,
        name: null,
        singleToolDescriptionOverride: null,
        appId: null,
      },
      { transaction: t }
    );

    return agent;
  }
}
