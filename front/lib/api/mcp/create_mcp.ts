import omit from "lodash/omit";

import type {
  ActionBaseParams,
  LightMCPToolConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT } from "@app/lib/actions/mcp";
import type { StepContext } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ModelId } from "@app/types/shared/model_id";

/**
 * Creates an MCP action in the database and returns both the DB record and the type object.
 */
export async function createMCPAction(
  auth: Authenticator,
  {
    actionBaseParams,
    actionConfiguration,
    augmentedInputs,
    stepContentId,
    stepContext,
  }: {
    actionBaseParams: ActionBaseParams;
    actionConfiguration: MCPToolConfigurationType;
    augmentedInputs: Record<string, unknown>;
    stepContentId: ModelId;
    stepContext: StepContext;
  }
): Promise<AgentMCPActionResource> {
  const toolConfiguration = omit(
    actionConfiguration,
    MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT
  ) as LightMCPToolConfigurationType;

  return AgentMCPActionResource.makeNew(auth, {
    agentMessageId: actionBaseParams.agentMessageId,
    augmentedInputs,
    citationsAllocated: stepContext.citationsCount,
    mcpServerConfigurationId: actionBaseParams.mcpServerConfigurationId,
    status: actionBaseParams.status,
    stepContentId,
    stepContext,
    toolConfiguration,
    version: 0,
  });
}
