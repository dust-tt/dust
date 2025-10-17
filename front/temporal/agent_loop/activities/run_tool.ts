import { Context } from "@temporalio/activity";
import assert from "assert";

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
import type { ModelId } from "@app/types";
import { assertNever } from "@app/types";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import { getAgentLoopData } from "@app/types/assistant/agent_run";

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
  const auth = await Authenticator.fromJSON(authType);
  const deferredEvents: ToolExecutionResult["deferredEvents"] = [];

  const runAgentDataRes = await getAgentLoopData(authType, runAgentArgs);
  if (runAgentDataRes.isErr()) {
    // If the conversation is not found, we cannot run the tool and should stop execution here.
    if (runAgentDataRes.error.message === "conversation_not_found") {
      logger.warn(
        {
          actionId,
          runIds,
        },
        "conversation_not_found while running tool, stopping execution"
      );
      return { deferredEvents };
    }
    throw runAgentDataRes.error;
  }

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
                  ...agentMessage,
                  content: agentMessage.content,
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
      case "tool_approve_execution":
        // Note from seb to pr: is it still possible to reach that place now that we block on approval https://github.com/dust-tt/dust/blob/15fac5beeb615f37c90bc81871699ee0b6466721/front/temporal/agent_loop/workflows.ts#L277 ?
        // Defer personal auth events to be sent after all tools complete.
        deferredEvents.push({
          event,
          context: {
            agentMessageId: agentMessage.sId,
            agentMessageRowId: agentMessageRow.id,
            conversationId: conversation.sId,
            step,
          },
          shouldPauseAgentLoop: true,
        });

        await ConversationResource.markAsActionRequired(auth, {
          conversation,
        });

        return { deferredEvents };

      case "tool_success":
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
