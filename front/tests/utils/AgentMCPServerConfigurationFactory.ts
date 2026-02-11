import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";

export class AgentMCPServerConfigurationFactory {
  static async create(
    auth: Authenticator,
    space: SpaceResource,
    options?: {
      agent?: AgentConfigurationType;
      mcpServerView?: MCPServerViewResource;
    }
  ): Promise<AgentMCPServerConfigurationModel> {
    const owner = auth.getNonNullableWorkspace();

    const agent =
      options?.agent ?? (await AgentConfigurationFactory.createTestAgent(auth));

    const mcpServerView =
      options?.mcpServerView ??
      (await MCPServerViewFactory.create(
        owner,
        autoInternalMCPServerNameToSId({
          name: "search",
          workspaceId: owner.id,
        }),
        space
      ));

    return AgentMCPServerConfigurationModel.create({
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
