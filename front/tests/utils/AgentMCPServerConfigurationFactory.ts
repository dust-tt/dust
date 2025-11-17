import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";

export class AgentMCPServerConfigurationFactory {
  static async create(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<AgentMCPServerConfiguration> {
    const owner = auth.getNonNullableWorkspace();

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const mcpServerView = await MCPServerViewFactory.create(
      owner,
      autoInternalMCPServerNameToSId({
        name: "search",
        workspaceId: owner.id,
      }),
      space
    );

    return AgentMCPServerConfiguration.create({
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
    });
  }
}
