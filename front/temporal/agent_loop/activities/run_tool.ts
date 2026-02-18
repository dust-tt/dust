import { runToolWithStreaming } from "@app/lib/api/mcp/run_tool";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type { ToolExecutionResult } from "@app/temporal/agent_loop/lib/deferred_events";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type {
  AgentLoopArgsWithTiming,
  AgentLoopExecutionData,
} from "@app/types/assistant/agent_run";
import {
  getAgentLoopData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  startActiveObservation,
  updateActiveObservation,
} from "@langfuse/tracing";
import { Context, heartbeat } from "@temporalio/activity";
import assert from "assert";

const CONVERSATION_CACHE_TTL_MS = 5000;

export async function runToolActivity(
  authType: AuthenticatorType,
  {
    actionId,
    runAgentArgs,
    step,
    runIds,
  }: {
    actionId: ModelId;
    runAgentArgs: AgentLoopArgsWithTiming;
    step: number;
    runIds?: string[];
  }
): Promise<ToolExecutionResult> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;
  const deferredEvents: ToolExecutionResult["deferredEvents"] = [];

  // Cache conversation fetches to reduce DB load when multiple tool activities run in parallel
  // during the same step. Each tool would otherwise fetch the same conversation independently.
  const runAgentDataRes = await getAgentLoopData(authType, {
    ...runAgentArgs,
    caching: {
      useCachedGetConversation: true,
      unicitySuffix: `${runAgentArgs.agentMessageId}:${runAgentArgs.agentMessageVersion}:${step}`,
      ttlMs: CONVERSATION_CACHE_TTL_MS,
    },
  });
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      logger.info(
        {
          actionId,
          runIds,
        },
        "Message or conversation was deleted, exiting"
      );
      return { deferredEvents };
    }
    throw runAgentDataRes.error;
  }

  // Heartbeating here as retrieving the agent loop data takes some time.
  heartbeat();

  const {
    agentConfiguration,
    conversation: originalConversation,
    agentMessage: originalAgentMessage,
    agentMessageRow,
  } = runAgentDataRes.value;

  const { slicedConversation: conversation, slicedAgentMessage: agentMessage } =
    sliceConversationForAgentMessage(originalConversation, {
      agentMessageId: originalAgentMessage.sId,
      agentMessageVersion: originalAgentMessage.version,
      // Include the current step output.
      //
      // TODO(DURABLE-AGENTS 2025-07-27): Change this as part of the
      // retryOnlyBlockedTools effort (the whole step should not be included,
      // tools successfully ran should be removed, this should be an arg to
      // sliceConversationForAgentMessage)
      step: step + 1,
    });

  const action = await AgentMCPActionResource.fetchByModelIdWithAuth(
    auth,
    actionId
  );
  assert(action, "Action not found");

  return startActiveObservation(
    `${action.toolConfiguration.mcpServerName}/${action.toolConfiguration.name}`,
    () => {
      updateActiveObservation(
        {
          input: {
            actionId,
            toolName: action.toolConfiguration.name,
            mcpServerName: action.toolConfiguration.mcpServerName,
          },
        },
        { asType: "tool" }
      );

      return executeToolStreaming(auth, {
        action,
        agentConfiguration,
        agentMessage,
        agentMessageRow,
        conversation,
        deferredEvents,
        runIds,
        step,
      });
    },
    { asType: "tool" }
  );
}

async function executeToolStreaming(
  auth: Authenticator,
  {
    action,
    agentConfiguration,
    agentMessage,
    agentMessageRow,
    conversation,
    deferredEvents,
    runIds,
    step,
  }: {
    action: AgentMCPActionResource;
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
    agentMessage: AgentLoopExecutionData["agentMessage"];
    agentMessageRow: AgentLoopExecutionData["agentMessageRow"];
    conversation: AgentLoopExecutionData["conversation"];
    deferredEvents: ToolExecutionResult["deferredEvents"];
    runIds?: string[];
    step: number;
  }
): Promise<ToolExecutionResult> {
  const abortSignal = Context.current().cancellationSignal;

  const eventStream = runToolWithStreaming(
    auth,
    {
      action,
      agentConfiguration,
      agentMessage,
      conversation,
    },
    {
      signal: abortSignal,
    }
  );

  for await (const event of eventStream) {
    switch (event.type) {
      case "tool_error":
        updateActiveObservation(
          {
            output: { status: "error", errorCode: event.error.code },
            level: "ERROR",
            statusMessage: event.error.message,
          },
          { asType: "tool" }
        );

        // For tool errors, send immediately.
        await updateResourceAndPublishEvent(auth, {
          event: {
            type: "tool_error",
            created: event.created,
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            conversationId: conversation.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
              metadata: event.error.metadata,
            },
            isLastBlockingEventForStep: true,
          },
          agentMessageRow,
          conversation,
          step,
        });

        return { deferredEvents };

      case "tool_early_exit":
        updateActiveObservation(
          {
            output: { status: "early_exit", isError: event.isError },
            level: event.isError ? "ERROR" : "WARNING",
            statusMessage: event.text ?? "Early exit",
          },
          { asType: "tool" }
        );

        let updatedAgentMessage = agentMessage;
        if (!event.isError && event.text && !agentMessage.content) {
          // Save and post the tool's text content only if the execution stopped
          // before any text was generated.
          await AgentStepContentResource.createNewVersion({
            workspaceId: conversation.owner.id,
            agentMessageId: agentMessage.agentMessageId,
            step: step + 1,
            index: 0,
            type: "text_content",
            value: {
              type: "text_content",
              value: event.text,
            },
          });

          // Include the newly created step content in the agentMessage.contents array
          // to ensure it's included in the agent_message_success event
          const newStepContent = {
            step: step + 1,
            content: {
              type: "text_content" as const,
              value: event.text,
            },
          };
          updatedAgentMessage = {
            ...agentMessage,
            content: event.text, // Update the content field so it's visible in the UI
            contents: [...(agentMessage.contents || []), newStepContent],
          };
        }

        await updateResourceAndPublishEvent(auth, {
          event: event.isError
            ? {
                type: "tool_error",
                created: event.created,
                configurationId: agentConfiguration.sId,
                messageId: agentMessage.sId,
                conversationId: conversation.sId,
                error: {
                  code: "early_exit",
                  message: event.text,
                  metadata: {
                    errorTitle: "Early exit",
                  },
                },
                isLastBlockingEventForStep: true,
              }
            : {
                type: "agent_message_success",
                created: event.created,
                configurationId: agentConfiguration.sId,
                messageId: agentMessage.sId,
                message: {
                  ...updatedAgentMessage,
                  content: updatedAgentMessage.content,
                  completedTs: event.created,
                },
                runIds: runIds ?? [],
              },

          agentMessageRow,
          conversation,
          step,
        });

        return { deferredEvents, shouldPauseAgentLoop: true };

      case "tool_personal_auth_required":
      case "tool_file_auth_required":
      case "tool_approve_execution":
        updateActiveObservation(
          {
            output: { status: event.type },
            level: "WARNING",
          },
          { asType: "tool" }
        );

        // Batched for publishing after all parallel tools complete to avoid partial UI state.
        deferredEvents.push({
          event,
          context: {
            agentMessageId: agentMessage.sId,
            agentMessageRowId: agentMessageRow.id,
            conversationId: conversation.sId,
            step,
            workspaceId: conversation.owner.id,
          },
          shouldPauseAgentLoop: true,
        });

        await ConversationResource.markAsActionRequired(auth, {
          conversation,
        });

        return { deferredEvents };

      case "tool_success":
        updateActiveObservation(
          {
            output: { status: "success" },
          },
          { asType: "tool" }
        );

        await updateResourceAndPublishEvent(auth, {
          event: {
            type: "agent_action_success",
            created: event.created,
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            action: event.action,
          },
          agentMessageRow,
          conversation,
          step,
        });
        break;
      case "tool_params":
      case "tool_notification":
        await updateResourceAndPublishEvent(auth, {
          event,
          agentMessageRow,
          conversation,
          step,
        });
        break;

      default:
        assertNever(event);
    }
  }

  return { deferredEvents };
}
