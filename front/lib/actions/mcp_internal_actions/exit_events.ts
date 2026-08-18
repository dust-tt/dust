import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  MCPApproveExecutionEvent,
  ToolAskUserQuestionEvent,
  ToolEarlyExitEvent,
  ToolFileAuthRequiredEvent,
  ToolPausedEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { getToolDisplayLabels } from "@app/lib/actions/tool_display_labels";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { pauseSandboxBashForBlockedChild } from "@app/lib/api/sandbox/sandbox_child_block";
import type { Authenticator } from "@app/lib/auth";
import { assertNever, isAgentPauseOutputResourceType } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

type MCPActionOutputItemWithContent = {
  content: CallToolResult["content"][number];
};

/**
 * Server-only utility for processing exit/pause events from MCP tool outputs.
 *
 * Do NOT import this file from client-side code.
 */
export async function getExitOrPauseEvents(
  auth: Authenticator,
  {
    outputItems,
    toolContext,
  }: {
    outputItems: MCPActionOutputItemWithContent[];
    toolContext: ToolContext;
  }
): Promise<
  (
    | MCPApproveExecutionEvent
    | ToolAskUserQuestionEvent
    | ToolPersonalAuthRequiredEvent
    | ToolFileAuthRequiredEvent
    | ToolEarlyExitEvent
    | ToolPausedEvent
  )[]
> {
  const { runContext } = toolContext;
  assert(runContext, "getExitOrPauseEvents requires a tool run context.");

  const exitOutputItem = outputItems
    .map((item) => item.content)
    .find(isAgentPauseOutputResourceType)?.resource;

  if (!exitOutputItem) {
    return [];
  }

  const { action, toolConfiguration } = runContext;

  // Identifiers scoping the events to the run context they were emitted from, plus the tool call
  // name and inputs as issued in that context.
  const { eventScope, toolCallName, inputs } = (() => {
    switch (runContext.contextType) {
      case "agent_loop":
        return {
          eventScope: {
            configurationId: runContext.agentConfiguration.sId,
            conversationId: runContext.conversation.sId,
            messageId: runContext.agentMessage.sId,
          },
          toolCallName: runContext.action.functionCallName ?? "unknown",
          inputs: runContext.action.augmentedInputs,
        };
      case "sandbox_function":
        return {
          eventScope: {
            sandboxFunctionId: runContext.invocation.sandboxFunction.sId,
            invocationId: runContext.invocation.sId,
          },
          toolCallName: runContext.action.toolName,
          inputs: runContext.action.inputs,
        };
      default:
        return assertNever(runContext);
    }
  })();

  switch (exitOutputItem.type) {
    case "tool_early_exit": {
      const { isError, reason, text } = exitOutputItem;
      const eventIsError = reason === "user_cancellation" ? false : isError;

      return [
        {
          type: "tool_early_exit",
          created: Date.now(),
          ...eventScope,
          text: text,
          isError: eventIsError,
          reason,
        },
      ];
    }
    case "tool_blocked_awaiting_input": {
      const { blockingEvents, state } = exitOutputItem;

      if (isAgentLoopRunContext(runContext)) {
        // Update the action status to blocked_child_action_input_required to break the agent loop.
        await runContext.action.updateStatus(
          "blocked_child_action_input_required"
        );

        // Update the step context to save the resume state.
        await runContext.action.updateStepContext({
          ...runContext.action.stepContext,
          resumeState: state,
        });
      }

      // TODO(SANDBOX_FUNCTIONS): supporting run_agent from a sandbox function requires
      // invocation-level pause/resume semantics (persisted resume state on the invocation and a
      // way for the caller to resume); wire them here then. Until that exists, failing loudly
      // beats emitting a plausible-looking but broken pause.

      // Forward any UI-facing blocking events the tool collected, plus a `tool_paused` sentinel.
      // The sentinel keeps the pause-decision on the event channel even when `blockingEvents` is
      // empty — the case for any future tool whose blocking event is published upstream out-of-band
      // (e.g. sandbox bash, where the child's blocking event is published by
      // `createSandboxChildAction` and never flows through bash's return). Without it,
      // `runToolWithStreaming` would fall through to `markAsSucceeded` on an already-blocked
      // action.Appended LAST so the for-await in `executeToolStreaming` processes every blocking
      // event before the sentinel triggers the return.
      return [
        // Blocking events are parsed with the public client schemas where agentName is optional;
        // normalize to the placeholder constant expected internally.
        ...blockingEvents.map((event) => ({
          ...event,
          metadata: { ...event.metadata, agentName: "agent" as const },
        })),
        {
          type: "tool_paused",
          created: Date.now(),
          ...eventScope,
          actionId: action.sId,
        },
      ];
    }
    case "tool_personal_auth_required": {
      const { provider, scope } = exitOutputItem;
      const displayLabels =
        getToolDisplayLabels({
          internalMCPServerName: getInternalMCPServerNameFromSId(
            toolConfiguration.toolServerId
          ),
          mcpServerName: toolConfiguration.mcpServerName,
          toolName: toolConfiguration.originalName,
          inputs,
        }) ?? toolConfiguration.displayLabels;

      const authErrorMessage =
        `The tool ${toolCallName} requires personal ` +
        `authentication, please authenticate to use it.`;

      switch (runContext.contextType) {
        case "agent_loop":
          await runContext.action.updateStatus(
            "blocked_authentication_required"
          );
          await pauseSandboxBashForBlockedChild(
            auth,
            runContext.action,
            runContext.conversation
          );
          break;
        case "sandbox_function":
          await runContext.action.updateStatus(
            "blocked_authentication_required"
          );
          break;
        default:
          assertNever(runContext);
      }

      return [
        {
          type: "tool_personal_auth_required",
          created: Date.now(),
          ...eventScope,
          userId: auth.user()?.sId,
          actionId: action.sId,
          metadata: {
            toolName: toolConfiguration.originalName,
            mcpServerName: toolConfiguration.mcpServerName,
            displayLabel: displayLabels?.done,
            agentName: "agent",
            mcpServerDisplayName: toolConfiguration.mcpServerName,
            mcpServerId: toolConfiguration.toolServerId,
          },
          inputs,
          authError: {
            mcpServerId: toolConfiguration.toolServerId,
            provider,
            toolName: toolCallName,
            message: authErrorMessage,
            ...(scope && {
              scope,
            }),
          },
        },
      ];
    }
    case "tool_file_auth_required": {
      const { fileId, fileName, connectionId, mimeType_file } = exitOutputItem;

      const fileAuthErrorMessage =
        `The tool ${toolCallName} requires file authorization ` +
        `for ${fileName}, please authorize the file to continue.`;

      // The blocked statuses and step context only exist on agent MCP actions; sandbox function
      // invocations observe the returned event instead.
      if (isAgentLoopRunContext(runContext)) {
        await runContext.action.updateStatus(
          "blocked_file_authorization_required"
        );
        await pauseSandboxBashForBlockedChild(
          auth,
          runContext.action,
          runContext.conversation
        );

        // Persisted here so the blocked action can be reconstructed on page reload.
        await runContext.action.updateStepContext({
          ...runContext.action.stepContext,
          fileAuthorizationInfo: {
            fileId,
            fileName,
            connectionId,
            mimeType: mimeType_file,
          },
        });
      }

      return [
        {
          type: "tool_file_auth_required",
          created: Date.now(),
          ...eventScope,
          userId: auth.user()?.sId,
          actionId: action.sId,
          metadata: {
            toolName: toolConfiguration.originalName,
            mcpServerName: toolConfiguration.mcpServerName,
            agentName: "agent",
            mcpServerDisplayName: toolConfiguration.mcpServerName,
            mcpServerId: toolConfiguration.toolServerId,
          },
          inputs,
          fileAuthError: {
            fileId,
            fileName,
            connectionId,
            mimeType: mimeType_file,
            toolName: toolCallName,
            message: fileAuthErrorMessage,
          },
        },
      ];
    }
    case "tool_user_answer_required": {
      const { question } = exitOutputItem;

      // The blocked statuses and step context only exist on agent MCP actions; sandbox function
      // invocations observe the returned event instead.
      if (isAgentLoopRunContext(runContext)) {
        await runContext.action.updateStatus("blocked_user_answer_required");
        await pauseSandboxBashForBlockedChild(
          auth,
          runContext.action,
          runContext.conversation
        );

        await runContext.action.updateStepContext({
          ...runContext.action.stepContext,
          resumeState: { type: "user_question", question },
        });
      }

      return [
        {
          type: "tool_ask_user_question",
          created: Date.now(),
          ...eventScope,
          userId: auth.user()?.sId,
          actionId: action.sId,
          metadata: {
            toolName: toolConfiguration.originalName,
            mcpServerName: toolConfiguration.mcpServerName,
            agentName: "agent",
          },
          inputs,
          question,
        },
      ];
    }
    default: {
      assertNever(exitOutputItem);
    }
  }
}
