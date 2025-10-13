import omit from "lodash/omit";

import type {
  LightMCPToolConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { StepContext } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageType } from "@app/types";
import type { ModelId } from "@app/types/shared/model_id";

/**
 * Creates an MCP action in the database and returns both the DB record and the type object.
 */
export async function createMCPAction(
  auth: Authenticator,
  {
    actionConfiguration,
    agentMessage,
    augmentedInputs,
    status,
    stepContentId,
    stepContext,
  }: {
    actionConfiguration: MCPToolConfigurationType;
    agentMessage: AgentMessageType;
    augmentedInputs: Record<string, unknown>;
    status: ToolExecutionStatus;
    stepContentId: ModelId;
    stepContext: StepContext;
  }
): Promise<AgentMCPActionResource> {
  const toolConfiguration = omit(
    actionConfiguration,
    MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT
  ) as LightMCPToolConfigurationType;

  return AgentMCPActionResource.makeNew(auth, {
    agentMessageId: agentMessage.agentMessageId,
    augmentedInputs,
    citationsAllocated: stepContext.citationsCount,
    mcpServerConfigurationId: actionConfiguration.id.toString(),
    status,
    stepContentId,
    stepContext,
    toolConfiguration,
    version: 0,
  });
}
