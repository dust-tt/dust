import {
  buildToolConfigurationsFromRawTools,
  deduplicateMCPServerConfigurations,
  disambiguateServerNamesBySpace,
} from "@app/lib/actions/mcp_actions";
import type { AgentLoopMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { validateToolInputs } from "@app/lib/actions/mcp_utils";
import { makeMCPApproveExecutionEventBase } from "@app/lib/actions/tool_approval_events";
import { tryGetPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { getExecutionStatusFromConfig } from "@app/lib/actions/tool_status";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { clearBlockedActionEffects } from "@app/lib/api/assistant/conversation/blocked_actions";
import { getConversationRankVersionLock } from "@app/lib/api/assistant/conversation/lock";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { resolveSkillMCPServers } from "@app/lib/api/assistant/skill_actions";
import { createMCPAction } from "@app/lib/api/mcp/create_mcp";
import { pauseReservedSandboxBash } from "@app/lib/api/sandbox/sandbox_child_block";
import type { Authenticator } from "@app/lib/auth";
import { notifyManualActionRequired } from "@app/lib/notifications/workflows/manual-action-required";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { launchSandboxChildToolWorkflow } from "@app/temporal/agent_loop/client";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type CreateSandboxChildActionResult = {
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
    agentVersion,
    conversationId,
    agentMessageId,
    serverViewId,
    toolName,
    rawInputs,
  }: {
    parentActionId: string;
    agentId: string;
    agentVersion: number;
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
    agentVersion,
    variant: "full",
  });
  if (!agentConfiguration) {
    return new Err(new Error("Agent configuration not found."));
  }

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversationResource) {
    return new Err(new Error("Conversation not found."));
  }

  const agentMessageRes = await conversationResource.getMessageById(
    auth,
    agentMessageId
  );

  if (agentMessageRes.isErr()) {
    return new Err(new Error("Agent message not found."));
  }

  const agentMessageRenderRes = await batchRenderMessages(
    auth,
    conversationResource,
    [agentMessageRes.value],
    "full"
  );
  if (agentMessageRenderRes.isErr()) {
    return new Err(new Error("Failed to render agent message."));
  }

  const agentMessage = agentMessageRenderRes.value[0];

  if (!isAgentMessageType(agentMessage)) {
    return new Err(new Error("Agent message not found."));
  }

  // Using the fetchConversationWithParticipantState method as we need the read and action required states
  const conversationRes =
    // biome-ignore lint/plugin/noExpensiveConversationFetch: need actionRequired/lastReadAt
    await ConversationResource.fetchConversationWithParticipantState(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    return new Err(new Error("Failed to fetch conversation."));
  }

  const conversation = conversationRes.value;

  // JIT servers cover tools added via the conversation input bar, skill
  // servers cover tools attached through skills. Resolve the server config
  // through the same deduplication and space-name disambiguation as the direct
  // agent-loop path (`tryListMCPTools`): when several configs share a name
  // across spaces, the model-visible name is space-prefixed, and approval keys
  // are derived from it.
  const jitServers = await getJITServers(auth, {
    agentConfiguration,
    conversation,
    attachments: [],
  });
  const { skillServers, systemSkillServers } = await resolveSkillMCPServers(
    auth,
    {
      agentConfiguration,
      conversation,
    }
  );

  const serverConfigs = await disambiguateServerNamesBySpace(
    auth,
    deduplicateMCPServerConfigurations({
      agentActions: agentConfiguration.actions,
      clientSideActions: [],
      skillServers: [...systemSkillServers, ...skillServers],
      jitServers,
    })
  );
  const serverSideConfig = serverConfigs
    .filter(isServerSideMCPServerConfiguration)
    .find((a) => a.mcpServerViewId === view.sId);

  if (!serverSideConfig) {
    return new Err(
      new Error("Tool is not available to this agent or conversation.")
    );
  }

  // Resolve the tool configuration (stake, enabled state, approval-requiring
  // arguments, retry policy, timeout) through the same code path as direct
  // agent-loop tool calls, so that approvals recorded on direct calls apply to
  // sandbox child calls too.
  const toolConfigurationsRes = await buildToolConfigurationsFromRawTools(
    auth,
    view.mcpServerId,
    serverSideConfig,
    [{ name: toolName, description: "" }]
  );
  if (toolConfigurationsRes.isErr()) {
    return toolConfigurationsRes;
  }
  // Empty when the tool has been disabled by an admin.
  const [toolConfiguration] = toolConfigurationsRes.value;

  if (!toolConfiguration) {
    return new Err(
      new Error("Tool is not available to this agent or conversation.")
    );
  }

  // User tool approvals ("low"/"medium" stakes) are keyed on the prefixed
  // function-call name the model sees on direct calls (e.g.
  // `salesforce__update_object`), while `dsbx` sends the raw tool name. Align
  // the configuration name so approval checks and recordings share one key.
  const prefixedToolNameRes = tryGetPrefixedToolName(
    serverSideConfig.name,
    toolName
  );
  if (prefixedToolNameRes.isErr()) {
    return prefixedToolNameRes;
  }

  const fullToolConfiguration = {
    ...toolConfiguration,
    name: prefixedToolNameRes.value,
  };

  const validateInputsResult = validateToolInputs(rawInputs);
  if (validateInputsResult.isErr()) {
    return validateInputsResult;
  }

  const { status } = await getExecutionStatusFromConfig(auth, {
    actionConfiguration: fullToolConfiguration,
    skipToolsValidation: agentMessage.skipToolsValidation,
    context: {
      toolInputs: rawInputs,
    },
  });

  // Auto-allowed child actions are launched right after creation: persist them as
  // "running" directly (like sandbox function actions) instead of rewriting the row at
  // execution start.
  const persistedStatus =
    status === "ready_allowed_implicitly" ? "running" : status;

  const creationRes = await withTransaction(async (transaction) => {
    // Terminal message updates use the same lock. This prevents a delayed sandbox request from
    // creating a child after cancellation while still letting terminal cleanup see any child
    // committed immediately before it.
    await getConversationRankVersionLock(auth, conversation, transaction);

    const parentAction = await AgentMCPActionResource.fetchById(
      auth,
      parentActionId,
      transaction
    );
    if (!parentAction) {
      return new Err(new Error("Parent action not found."));
    }
    if (parentAction.agentMessageId !== agentMessage.agentMessageId) {
      return new Err(
        new Error("Parent action does not belong to the agent message.")
      );
    }
    if (
      parentAction.status !== "running" &&
      parentAction.status !== "blocked_child_action_input_required"
    ) {
      return new Err(new Error("Parent sandbox action is no longer running."));
    }
    if (!(await parentAction.canAgentMessageResume(auth, transaction))) {
      return new Err(
        new Error("Agent message can no longer run sandbox child actions.")
      );
    }

    let shouldPauseSandbox = false;
    if (
      status === "blocked_validation_required" &&
      parentAction.status === "running"
    ) {
      const [updatedCount] = await parentAction.updateStatusFromExpected(auth, {
        status: "blocked_child_action_input_required",
        expectedStatus: "running",
        transaction,
      });
      if (updatedCount === 0) {
        return new Err(
          new Error("Parent sandbox action is no longer running.")
        );
      }
      shouldPauseSandbox = true;
    }

    const action = await createMCPAction(auth, {
      actionConfiguration: fullToolConfiguration,
      agentMessage,
      augmentedInputs: rawInputs,
      conversation,
      status: persistedStatus,
      stepContent: parentAction.stepContent,
      stepContext: {
        ...parentAction.stepContext,
        resumeState: null,
        sandboxChildActionInfo: { parentActionId: parentAction.sId },
      },
      transaction,
    });

    return new Ok({ action, parentAction, shouldPauseSandbox });
  });
  if (creationRes.isErr()) {
    return creationRes;
  }

  const { action, parentAction, shouldPauseSandbox } = creationRes.value;

  // The lock above prevents creation after terminalization. Re-check before external side effects
  // to cover terminalization immediately after the transaction committed.
  if (!(await action.canAgentMessageResume(auth))) {
    await action.updateStatusFromExpected(auth, {
      status: "denied",
      expectedStatus: action.status,
    });
    return new Err(
      new Error("Agent message can no longer run sandbox child actions.")
    );
  }

  if (status === "blocked_validation_required") {
    const approvalRequirementEvent: AgentLoopMCPApproveExecutionEvent = {
      ...(await makeMCPApproveExecutionEventBase(auth, {
        actionId: action.sId,
        toolConfiguration: fullToolConfiguration,
        inputs: rawInputs,
        approvalSubjectName: agentConfiguration.name,
      })),
      configurationId: fullToolConfiguration.sId,
      conversationId: conversation.sId,
      messageId: agentMessage.sId,
      isLastBlockingEventForStep: true,
    };

    await updateResourceAndPublishEvent(auth, {
      event: approvalRequirementEvent,
      agentMessage,
      conversation,
      step: parentAction.stepContent.step,
    });

    await ConversationResource.markAsActionRequired(auth, { conversation });

    const canStillBlock = await withTransaction(async (transaction) => {
      await getConversationRankVersionLock(auth, conversation, transaction);

      const freshAction = await AgentMCPActionResource.fetchById(
        auth,
        action.sId,
        transaction
      );
      if (
        freshAction?.status === "blocked_validation_required" &&
        (await freshAction.canAgentMessageResume(auth, transaction))
      ) {
        return true;
      }

      if (freshAction?.status === "blocked_validation_required") {
        await freshAction.updateStatusFromExpected(auth, {
          status: "denied",
          expectedStatus: "blocked_validation_required",
          transaction,
        });
      }
      return false;
    });
    if (!canStillBlock) {
      // Cancellation can commit immediately before the approval event is published. Its terminal
      // cleanup then has nothing left to remove, so this post-publish check removes the late event
      // and clears the denormalized actionRequired flag. If cancellation commits afterward, its
      // normal cleanup performs the same idempotent work.
      await clearBlockedActionEffects(auth, {
        actionIds: [action.sId],
        conversationId: conversation.sId,
        messageId: agentMessage.sId,
      });
      return new Err(
        new Error("Agent message can no longer run sandbox child actions.")
      );
    }

    if (!conversation.actionRequired) {
      notifyManualActionRequired(auth, {
        conversationId: conversation.sId,
        actionId: action.sId,
      });
    }

    // Hand the sandbox pause back to the caller instead of pausing here.
    // `pauseReservedSandboxBash` freezes the whole sandbox via
    // `betaPause` — including the `dsbx` client still blocked on this `/call`
    // request. Pausing before the response is flushed would mean `dsbx` never
    // receives `actionId`, so it could never poll for the result. The caller
    // runs this after responding; the surviving `dsbx` process then resumes,
    // finishes polling, and its output is collected via the bash `tee`/
    // wait-and-collect wake-up flow.
    return new Ok({
      actionId: action.sId,
      pauseSandbox: shouldPauseSandbox
        ? () => pauseReservedSandboxBash(auth, action, conversation)
        : () => Promise.resolve(),
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
