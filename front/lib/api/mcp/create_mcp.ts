import type {
  LightMCPToolConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { StepContext } from "@app/lib/actions/types";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { isString } from "@app/types/shared/utils/general";
import omit from "lodash/omit";

function extractDataSourceId(input: unknown): string | null {
  if (isString(input)) {
    return input.split("/").pop() ?? input;
  }

  if (!input || typeof input !== "object" || !("uri" in input)) {
    return null;
  }

  const { uri } = input;
  return isString(uri) ? uri.split("/").pop() ?? uri : null;
}

function extractAccessedDataSourceIds(
  inputs: Record<string, unknown>
): string {
  const dataSources = inputs.dataSources;
  if (!Array.isArray(dataSources)) {
    return "";
  }

  return dataSources.map(extractDataSourceId).filter(isString).join(",");
}

/**
 * Creates an MCP action in the database and returns both the DB record and the type object.
 */
export async function createMCPAction(
  auth: Authenticator,
  {
    actionConfiguration,
    agentMessage,
    augmentedInputs,
    conversation,
    status,
    stepContent,
    stepContext,
  }: {
    actionConfiguration: MCPToolConfigurationType;
    agentMessage: AgentMessageType;
    augmentedInputs: Record<string, unknown>;
    conversation: ConversationWithoutContentType;
    status: ToolExecutionStatus;
    stepContent: AgentStepContentResource;
    stepContext: StepContext;
  }
): Promise<AgentMCPActionResource> {
  const toolConfiguration = omit(
    actionConfiguration,
    MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT
  ) as LightMCPToolConfigurationType;

  const action = await AgentMCPActionResource.makeNew(
    auth,
    { conversation, stepContent },
    {
      agentMessageId: agentMessage.agentMessageId,
      augmentedInputs,
      citationsAllocated: stepContext.citationsCount,
      mcpServerConfigurationId: actionConfiguration.id.toString(),
      status,
      stepContext,
      toolConfiguration,
    }
  );

  if (status === "blocked_validation_required") {
    void emitAuditLogEvent({
      auth,
      action: "tool.approval_requested",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("agent", agentMessage.configuration),
        buildAuditLogTarget("tool", {
          sId: toolConfiguration.name,
          name: toolConfiguration.originalName,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        action_id: String(action.sId),
        tool_name: String(toolConfiguration.originalName),
        mcp_server_name: String(toolConfiguration.mcpServerName),
        conversation_id: String(conversation.sId),
        message_id: String(agentMessage.sId),
        request_status: agentMessage.version > 0 ? "retry" : "active",
        accessed_data_source_ids: extractAccessedDataSourceIds(
          action.augmentedInputs
        ),
      },
    });
  }

  return action;
}
