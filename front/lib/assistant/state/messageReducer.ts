import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { BaseAction } from "@app/lib/actions/types";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { AgentActionType } from "@app/types";
import { assertNever } from "@app/types";
import type { LightAgentMessageType } from "@app/types/assistant/conversation";

export type AgentStateClassification = "thinking" | "acting" | "done";

export type ActionProgressState = Map<
  BaseAction["id"],
  {
    action: AgentActionType;
    progress?: ProgressNotificationContentType;
  }
>;

export interface MessageTemporaryState {
  message: LightAgentMessageType;
  agentState: AgentStateClassification;
  isRetrying: boolean;
  lastUpdated: Date;
  actionProgress: ActionProgressState;
}

export type AgentMessageStateEvent = AgentMessageEvents | ToolNotificationEvent;

type AgentMessageStateEventWithoutToolApproveExecution = Exclude<
  AgentMessageStateEvent,
  { type: "tool_approve_execution" }
>;

function updateMessageWithAction(
  m: LightAgentMessageType,
  action: AgentActionType
): LightAgentMessageType {
  return {
    ...m,
    actions: [
      ...m.actions.filter((a) => a.id !== action.id),
      {
        type: action.type,
        id: action.id,
      },
    ],
  };
}

function updateProgress(
  state: MessageTemporaryState,
  event: ToolNotificationEvent
): MessageTemporaryState {
  const actionId = event.action.id;
  const currentProgress = state.actionProgress.get(actionId);

  const newState = {
    ...state,
    actionProgress: new Map(state.actionProgress).set(actionId, {
      action: event.action,
      progress: {
        ...currentProgress?.progress,
        ...event.notification,
        data: {
          ...currentProgress?.progress?.data,
          ...event.notification.data,
        },
      },
    }),
  };

  return newState;
}

export function messageReducer(
  state: MessageTemporaryState,
  event: AgentMessageStateEventWithoutToolApproveExecution
): MessageTemporaryState {
  switch (event.type) {
    case "agent_action_success":
      return {
        ...state,
        message: updateMessageWithAction(state.message, event.action),
        agentState: "thinking",
        // Clean up progress for this specific action.
        actionProgress: new Map(
          Array.from(state.actionProgress.entries()).filter(
            ([id]) => id !== event.action.id
          )
        ),
      };

    case "tool_notification": {
      return updateProgress(state, event);
    }

    case "tool_error":
    case "agent_error":
      return {
        ...state,
        message: {
          ...state.message,
          status: "failed",
          error: event.error,
        },
        agentState: "done",
      };

    case "agent_generation_cancelled":
      return {
        ...state,
        message: {
          ...state.message,
          status: "cancelled",
        },
        agentState: "done",
      };

    case "agent_message_success":
      return {
        ...state,
        message: getLightAgentMessageFromAgentMessage(event.message),
        agentState: "done",
      };

    case "generation_tokens": {
      const newState = { ...state };
      switch (event.classification) {
        case "closing_delimiter":
        case "opening_delimiter":
          break;
        case "tokens":
          newState.message.content =
            (newState.message.content || "") + event.text;
          break;
        case "chain_of_thought":
          newState.message.chainOfThought =
            (newState.message.chainOfThought || "") + event.text;
          break;
        default:
          assertNever(event);
      }
      newState.agentState = "thinking";
      return newState;
    }
    case "tool_params":
      return {
        ...state,
        message: updateMessageWithAction(state.message, event.action),
        agentState: "acting",
      };

    default:
      assertNever(event);
  }
}
