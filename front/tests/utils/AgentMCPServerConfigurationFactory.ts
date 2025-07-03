import type { Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

export class AgentMCPServerConfigurationFactory {
  static async create(
    auth: Authenticator,
    t: Transaction
  ): Promise<AgentMCPServerConfiguration> {
    const owner = auth.getNonNullableWorkspace();

    const agent = await AgentConfigurationFactory.createTestAgent(auth, t);
    const mcpServerView = await MCPServerViewFactory.create(
      owner,
      "dummy_mcp_server_id",
      await SpaceFactory.global(owner, t)
    );

    return AgentMCPServerConfiguration.create(
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
  }
}
