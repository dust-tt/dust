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
import { pauseSandboxBashForBlockedChild } from "@app/lib/api/sandbox/sandbox_child_block";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { launchSandboxChildToolWorkflow } from "@app/temporal/agent_loop/client";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type CreateSandboxChildActionResult = {
  actionId: string;
  // Present only when the child is blocked awaiting approval. Pausing the
  // sandbox freezes the in-sandbox `dsbx` client that is still awaiting THIS
  // `/call` request, so the caller MUST run this only after the response
  // (carrying `actionId`) has been flushed — otherwise `dsbx` never receives
  // `actionId` and can never poll for the result.
  pauseSandbox?: () => Promise<void>;
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
    return new Err(new Error("MCP server view not found."));
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
  });
  if (!agentConfiguration) {
    return new Err(new Error("Agent configuration not found."));
  }

  const conversationResult = await getConversation(auth, conversationId);
  if (conversationResult.isErr()) {
    return new Err(new Error("Conversation not found."));
  }

  const parentAction = await AgentMCPActionResource.fetchById(
    auth,
    parentActionId
  );
  if (!parentAction) {
    return new Err(new Error("Parent action not found."));
  }

  const conversation = conversationResult.value;

  const agentMessage = conversation.content
    .flat()
    .find(
      (m): m is AgentMessageType =>
        m.type === "agent_message" && m.sId === agentMessageId
    );
  if (!agentMessage) {
    return new Err(new Error("Agent message not found."));
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
      new Error("Tool is not available to this agent or conversation.")
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
      new Error("Tool is not available to this agent or conversation.")
    );
  }

  const validateInputsResult = validateToolInputs(rawInputs);
  if (validateInputsResult.isErr()) {
    return validateInputsResult;
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
    const approvalRequirementEvent: MCPApproveExecutionEvent = {
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
      event: approvalRequirementEvent,
      agentMessage,
      conversation,
      step: parentAction.stepContent.step,
    });

    await ConversationResource.markAsActionRequired(auth, { conversation });

    // Hand the sandbox pause back to the caller instead of pausing here.
    // `pauseSandboxBashForBlockedChild` freezes the whole sandbox via
    // `betaPause` — including the `dsbx` client still blocked on this `/call`
    // request. Pausing before the response is flushed would mean `dsbx` never
    // receives `actionId`, so it could never poll for the result. The caller
    // runs this after responding; the surviving `dsbx` process then resumes,
    // finishes polling, and its output is collected via the bash `tee`/
    // wait-and-collect wake-up flow.
    return new Ok({
      actionId: action.sId,
      pauseSandbox: () =>
        pauseSandboxBashForBlockedChild(auth, action, conversation),
    });
  }

  const userMessageInfo = await getUserMessageIdFromMessageId(auth, {
    messageId: agentMessage.sId,
  });

  await launchSandboxChildToolWorkflow(auth, {
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
    action,
    step: parentAction.stepContent.step,
  });

  return new Ok({
    actionId: action.sId,
  });
}
