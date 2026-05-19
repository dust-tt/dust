import {
  FALLBACK_INTERNAL_AUTO_SERVERS_TOOL_STAKE_LEVEL,
  FALLBACK_MCP_TOOL_STAKE_LEVEL,
} from "@app/lib/actions/constants";
import { makeServerSideMCPToolConfigurations } from "@app/lib/actions/mcp_actions";
import {
  getAvailabilityOfInternalMCPServerById,
  getInternalMCPServerDisplayedAs,
  getInternalMCPServerNameFromSId,
  getInternalMCPServerToolStakes,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { validateToolInputs } from "@app/lib/actions/mcp_utils";
import { getApprovalArgsLabel } from "@app/lib/actions/tool_approval_labels";
import { getExecutionStatusFromConfig } from "@app/lib/actions/tool_status";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { DEFAULT_MCP_TOOL_RETRY_POLICY } from "@app/lib/api/mcp";
import { createMCPAction } from "@app/lib/api/mcp/create_mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { launchSandboxChildToolWorkflow } from "@app/temporal/agent_loop/client";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type CreateSandboxChildActionResult = {
  actionId: string;
  needsApproval: boolean;
};

/**
 * Creates a sandbox child MCP action — the result of an LLM running inside a
 * `sandbox` MCP tool invoking another MCP tool through the public sandbox API.
 */
export async function createSandboxChildAction(
  auth: Authenticator,
  {
    parentActionId,
    agentId,
    conversationId,
    agentMessageId,
    serverViewId,
    toolName,
    rawInputs,
  }: {
    parentActionId: string;
    agentId: string;
    conversationId: string;
    agentMessageId: string;
    serverViewId: string;
    toolName: string;
    rawInputs: Record<string, unknown>;
  }
): Promise<Result<CreateSandboxChildActionResult, Error>> {
  const view = await MCPServerViewResource.fetchById(auth, serverViewId);
  if (!view) {
    return new Err(normalizeError("MCP server view not found."));
  }

  const [agentConfiguration, conversationResult, parentAction] =
    await Promise.all([
      getAgentConfiguration(auth, { agentId, variant: "full" }),
      getConversation(auth, conversationId),
      AgentMCPActionResource.fetchById(auth, parentActionId),
    ]);

  if (!agentConfiguration) {
    return new Err(normalizeError("Agent configuration not found."));
  }
  if (conversationResult.isErr()) {
    return new Err(normalizeError("Conversation not found."));
  }
  if (!parentAction) {
    return new Err(normalizeError("Parent action not found."));
  }

  const conversation = conversationResult.value;

  const agentMessage = conversation.content
    .flat()
    .find(
      (m): m is AgentMessageType =>
        m.type === "agent_message" && m.sId === agentMessageId
    );
  if (!agentMessage) {
    return new Err(normalizeError("Agent message not found."));
  }

  // JIT servers cover tools added via the conversation input bar.
  let serverSideConfig = agentConfiguration.actions
    .filter(isServerSideMCPServerConfiguration)
    .find((a) => a.mcpServerViewId === view.sId);

  if (!serverSideConfig) {
    const { servers: jitServers } = await getJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments: [],
    });
    serverSideConfig = jitServers.find((s) => s.mcpServerViewId === view.sId);
  }

  if (!serverSideConfig) {
    return new Err(
      normalizeError("Tool is not available to this agent or conversation.")
    );
  }

  const availability = getAvailabilityOfInternalMCPServerById(view.mcpServerId);
  const internalServerName = getInternalMCPServerNameFromSId(view.mcpServerId);
  const serverDefaultStake = internalServerName
    ? getInternalMCPServerToolStakes(internalServerName)[toolName]
    : undefined;

  const stakeLevel =
    view.getToolPermission(toolName) ??
    serverDefaultStake ??
    (availability === "manual"
      ? FALLBACK_MCP_TOOL_STAKE_LEVEL
      : FALLBACK_INTERNAL_AUTO_SERVERS_TOOL_STAKE_LEVEL);

  const [fullToolConfiguration] = makeServerSideMCPToolConfigurations(
    serverSideConfig,
    [
      {
        name: toolName,
        description: "",
        availability,
        stakeLevel,
        toolServerId: view.mcpServerId,
        retryPolicy: DEFAULT_MCP_TOOL_RETRY_POLICY,
      },
    ]
  );

  if (!fullToolConfiguration) {
    return new Err(
      normalizeError("Tool is not available to this agent or conversation.")
    );
  }

  const validateInputsResult = validateToolInputs(rawInputs);
  if (validateInputsResult.isErr()) {
    return new Err(normalizeError(validateInputsResult.error));
  }

  const { status } = await getExecutionStatusFromConfig(auth, {
    actionConfiguration: fullToolConfiguration,
    agentMessage,
    context: {
      agentId: agentConfiguration.sId,
      toolInputs: rawInputs,
    },
  });

  const action = await createMCPAction(auth, {
    actionConfiguration: fullToolConfiguration,
    agentMessage,
    augmentedInputs: rawInputs,
    conversation,
    status,
    stepContent: parentAction.stepContent,
    stepContext: {
      ...parentAction.stepContext,
      resumeState: null,
      sandboxChildActionInfo: { parentActionId: parentAction.sId },
    },
  });

  if (status === "blocked_validation_required") {
    const argumentsRequiringApproval =
      fullToolConfiguration.argumentsRequiringApproval ?? [];
    const internalMCPServerName = getInternalMCPServerNameFromSId(
      fullToolConfiguration.toolServerId
    );
    const approvalEvent: MCPApproveExecutionEvent = {
      type: "tool_approve_execution",
      actionId: action.sId,
      configurationId: fullToolConfiguration.sId,
      conversationId: conversation.sId,
      created: Date.now(),
      inputs: rawInputs,
      messageId: agentMessage.sId,
      stake: fullToolConfiguration.permission,
      userId: auth.user()?.sId,
      isLastBlockingEventForStep: true,
      metadata: {
        toolName: fullToolConfiguration.originalName,
        mcpServerName: fullToolConfiguration.mcpServerName,
        agentName: agentConfiguration.name,
        icon: fullToolConfiguration.icon,
        displayedAs: getInternalMCPServerDisplayedAs(
          fullToolConfiguration.toolServerId
        ),
      },
      argumentsRequiringApproval,
      approvalArgsLabel: await getApprovalArgsLabel({
        auth,
        internalMCPServerName,
        toolName: fullToolConfiguration.originalName,
        agentName: agentConfiguration.name,
        inputs: rawInputs,
        argumentsRequiringApproval,
      }),
    };

    await updateResourceAndPublishEvent(auth, {
      event: approvalEvent,
      agentMessage,
      conversation,
      step: parentAction.stepContent.step,
    });
  } else {
    const userMessageInfo = await getUserMessageIdFromMessageId(auth, {
      messageId: agentMessage.sId,
    });

    await launchSandboxChildToolWorkflow({
      auth,
      agentLoopArgs: {
        agentMessageId: agentMessage.sId,
        agentMessageVersion: agentMessage.version,
        conversationId: conversation.sId,
        conversationTitle: conversation.title,
        conversationBranchId: agentMessage.branchId,
        userMessageId: userMessageInfo.userMessageId,
        userMessageVersion: userMessageInfo.userMessageVersion,
        userMessageOrigin: userMessageInfo.userMessageOrigin,
        initialStartTime: Date.now(),
      },
      action: action.toJSON(),
      step: parentAction.stepContent.step,
    });
  }

  return new Ok({
    actionId: action.sId,
    needsApproval: status === "blocked_validation_required",
  });
}
